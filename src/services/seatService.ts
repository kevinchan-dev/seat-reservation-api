import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from './redisService.js';

const HOLD_DURATION = 10; // seconds

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

    if (seatHoldData.success && seatHoldData.data.userId !== userId) {
      throw new Error('Seat is being held by another user');
    }

    // Check if user has reached the hold limit
    const userHolds = await this.redisService.keys(`seathold:${eventId}:*`);
    let userHoldCount = 0;

    for (const key of userHolds) {
      const holdData = await this.redisService.hgetall(key);
      if (holdData.userId === userId && holdData.status === 'held') {
        userHoldCount++;
        if (userHoldCount >= 5) {
          throw new Error('Maximum hold limit reached');
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
    await this.redisService.expire(seatHoldKey, HOLD_DURATION);

    return { holdId, seatNumber, expiresIn: HOLD_DURATION };
  }

  async reserveSeat(eventId: string, userId: string, seatNumber: number) {
    const seatKey = `seat:${eventId}:${seatNumber}`;
    const rawSeatData = await this.redisService.hgetall(seatKey);
    const seatData = seatDataSchema.safeParse(rawSeatData);

    if (!seatData.success || Object.keys(rawSeatData).length === 0) {
      throw new Error('Seat not found');
    }

    if (seatData.data.status !== 'available') {
      throw new Error('Seat is not available');
    }

    // Check if seat is being held by the same user
    const seatHoldKey = `seathold:${eventId}:${seatNumber}`;
    const rawSeatHoldData = await this.redisService.hgetall(seatHoldKey);
    const seatHoldData = seatHoldDataSchema.safeParse(rawSeatHoldData);

    if (!seatHoldData.success) {
      throw new Error('Seat is not held');
    }

    if (seatHoldData.data.userId !== userId) {
      throw new Error('Seat is held by another user');
    }

    // Reserve the seat
    await this.redisService.hset(seatKey, {
      status: 'reserved',
      userId,
      reservedAt: Date.now(),
    });

    // Update available seats count
    await this.redisService.hincrby(`event:${eventId}`, 'availableSeats', -1);

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

    for (const key of seatKeys) {
      const rawSeatData = await this.redisService.hgetall(key);
      const seatData = seatDataSchema.safeParse(rawSeatData);

      if (seatData.success && seatData.data.status === 'available') {
        availableSeats.push({
          seatNumber: parseInt(seatData.data.seatNumber),
          status: seatData.data.status,
        });
      }
    }

    return { availableSeats };
  }
}
