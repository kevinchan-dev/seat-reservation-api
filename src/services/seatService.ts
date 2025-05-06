import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from './redisService.js';
import { config } from '../config.js';

const seatDataSchema = z.object({
  status: z.enum(['available', 'reserved']),
  seatNumber: z.string(),
  eventId: z.string(),
  userId: z.string().optional(),
  heldAt: z.string().optional(),
  reservedAt: z.string().optional(),
});

const seatHoldDataSchema = z.object({
  status: z.literal('held'),
  userId: z.string(),
  holdId: z.string(),
  heldAt: z.string(),
});

export class SeatService {
  constructor(private readonly redisService: RedisService) {}

  async holdSeat(eventId: string, userId: string, seatNumber: number) {
    // Check if event exists
    const eventExists = await this.redisService.exists(`event:${eventId}`);
    if (!eventExists) {
      throw new Error('Event not found');
    }

    // Check if seat exists and is available
    const seatKey = `seat:${eventId}:${seatNumber}`;
    const rawSeatData = await this.redisService.hgetall(seatKey);
    const seatData = seatDataSchema.safeParse(rawSeatData);

    if (!seatData.success || Object.keys(rawSeatData).length === 0) {
      throw new Error('Seat not found');
    }

    if (seatData.data.status !== 'available') {
      throw new Error('Seat is not available');
    }

    // Check if seat is being held by another user
    const seatHoldKey = `seathold:${eventId}:${seatNumber}`;
    const rawSeatHoldData = await this.redisService.hgetall(seatHoldKey);
    const seatHoldData = seatHoldDataSchema.safeParse(rawSeatHoldData);

    if (seatHoldData.success) {
      if (seatHoldData.data.userId !== userId) {
        throw new Error('Seat is being held by another user');
      } else {
        // Refresh the hold
        await this.redisService.expire(seatHoldKey, config.SEAT_HOLD_DURATION_SECONDS);
        return { holdId: seatHoldData.data.holdId, seatNumber, expiresIn: config.SEAT_HOLD_DURATION_SECONDS };
      }
    }

    // Check if user has reached the hold limit
    const userHolds = await this.redisService.keys(`seathold:${eventId}:*`);
    let userHoldCount = 0;

    // Use pipeline to check all holds in parallel
    const pipeline = this.redisService.createPipeline();
    for (const key of userHolds) {
      pipeline.hgetall(key);
    }
    const holdResults = await pipeline.exec();

    if (holdResults) {
      for (const [err, result] of holdResults) {
        if (!err && result) {
          const holdData = seatHoldDataSchema.safeParse(result as Record<string, string>);
          if (holdData.success && holdData.data.userId === userId && holdData.data.status === 'held') {
            userHoldCount++;
            if (userHoldCount > config.MAX_HOLDS_PER_USER) {
              throw new Error('Maximum hold limit reached');
            }
          }
        }
      }
    }

    // Create hold
    const holdId = uuidv4();
    await this.redisService.hset(seatHoldKey, {
      status: 'held',
      userId,
      holdId,
      heldAt: Date.now(),
    });

    // Set hold expiration
    await this.redisService.expire(seatHoldKey, config.SEAT_HOLD_DURATION_SECONDS);

    return { holdId, seatNumber, expiresIn: config.SEAT_HOLD_DURATION_SECONDS };
  }

  async reserveSeat(eventId: string, userId: string, seatNumber: number) {
    const seatKey = `seat:${eventId}:${seatNumber}`;
    const seatHoldKey = `seathold:${eventId}:${seatNumber}`;

    // Use pipeline to get both seat and seat hold data in parallel
    const pipeline = this.redisService.createPipeline();
    pipeline.hgetall(seatKey);
    pipeline.hgetall(seatHoldKey);
    const results = await pipeline.exec();

    if (!results) {
      throw new Error('Failed to get seat data');
    }

    const [seatResult, holdResult] = results;
    if (!seatResult || !holdResult) {
      throw new Error('Failed to get seat data');
    }

    const [seatErr, seatData] = seatResult;
    const [holdErr, holdData] = holdResult;

    if (seatErr || holdErr) {
      throw new Error('Failed to get seat data');
    }

    const parsedSeatData = seatDataSchema.safeParse(seatData as Record<string, string>);
    const parsedHoldData = seatHoldDataSchema.safeParse(holdData as Record<string, string>);

    if (!parsedSeatData.success || Object.keys(seatData as Record<string, string>).length === 0) {
      throw new Error('Seat not found');
    }

    if (parsedSeatData.data.status !== 'available') {
      throw new Error('Seat is not available');
    }

    if (!parsedHoldData.success) {
      throw new Error('Seat is not held');
    }

    if (parsedHoldData.data.userId !== userId) {
      throw new Error('Seat is held by another user');
    }

    // Use pipeline to update seat status and available seats count in parallel
    const updatePipeline = this.redisService.createPipeline();
    updatePipeline.hset(seatKey, {
      status: 'reserved',
      userId,
      reservedAt: Date.now(),
    });
    updatePipeline.hincrby(`event:${eventId}`, 'availableSeats', -1);
    await updatePipeline.exec();

    return { seatNumber, status: 'reserved' };
  }

  async getAvailableSeats(eventId: string) {
    // Check if event exists
    const eventExists = await this.redisService.exists(`event:${eventId}`);
    if (!eventExists) {
      throw new Error('Event not found');
    }

    // Get all seats for the event
    const seatKeys = await this.redisService.keys(`seat:${eventId}:*`);
    const availableSeats = [];

    // Use pipeline to get all seat data in parallel
    const pipeline = this.redisService.createPipeline();
    for (const key of seatKeys) {
      pipeline.hgetall(key);
    }
    const results = await pipeline.exec();

    if (results) {
      for (const [err, result] of results) {
        if (!err && result) {
          const seatData = seatDataSchema.safeParse(result as Record<string, string>);
          if (seatData.success && seatData.data.status === 'available') {
            availableSeats.push({
              seatNumber: parseInt(seatData.data.seatNumber),
              status: seatData.data.status,
            });
          }
        }
      }
    }

    return { availableSeats };
  }
}
