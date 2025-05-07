import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from './redisService.js';
import { config } from '../config.js';

export const seatDataSchema = z.object({
  status: z.enum(['available', 'reserved']),
  seatNumber: z.coerce.number(),
  eventId: z.string(),
  userId: z.string().optional(),
  heldAt: z.coerce.number().optional(),
  reservedAt: z.coerce.number().optional(),
});

export const seatHoldDataSchema = z.object({
  status: z.literal('held'),
  userId: z.string(),
  holdId: z.string(),
  heldAt: z.string(),
});

export type SeatData = z.infer<typeof seatDataSchema>;
export type SeatHoldData = z.infer<typeof seatHoldDataSchema>;

export async function holdSeat(
  redisService: RedisService,
  eventId: string,
  userId: string,
  seatNumber: number
) {
  // Check if event exists
  const eventExists = await redisService.exists(`event:${eventId}`);
  if (!eventExists) {
    throw new Error('Event not found');
  }

  // Check if seat exists and is available
  const seatKey = `seat:${eventId}:${seatNumber}`;
  const rawSeatData = await redisService.hgetall(seatKey);
  const seatData = seatDataSchema.safeParse(rawSeatData);

  if (!seatData.success || Object.keys(rawSeatData).length === 0) {
    throw new Error('Seat not found');
  }

  if (seatData.data.status !== 'available') {
    throw new Error('Seat is not available');
  }

  // Check if seat is being held by another user
  const seatHoldKey = `seathold:${eventId}:${seatNumber}`;
  const rawSeatHoldData = await redisService.hgetall(seatHoldKey);
  const seatHoldData = seatHoldDataSchema.safeParse(rawSeatHoldData);

  if (seatHoldData.success) {
    if (seatHoldData.data.userId !== userId) {
      throw new Error('Seat is being held by another user');
    } else {
      // Refresh the hold
      await redisService.expire(seatHoldKey, config.SEAT_HOLD_DURATION_SECONDS);
      return {
        holdId: seatHoldData.data.holdId,
        seatNumber,
        expiresIn: config.SEAT_HOLD_DURATION_SECONDS,
      };
    }
  }

  // Check if user has reached the hold limit
  const userHolds = await redisService.keys(`seathold:${eventId}:*`);
  let userHoldCount = 0;

  // Use pipeline to check all holds in parallel
  const pipeline = redisService.createPipeline();
  for (const key of userHolds) {
    pipeline.hgetall(key);
  }
  const holdResults = await pipeline.exec();

  if (holdResults) {
    for (const [err, result] of holdResults) {
      if (!err && result) {
        const holdData = seatHoldDataSchema.parse(result as Record<string, string>);
        if (holdData && holdData.userId === userId) {
          userHoldCount++;
          if (userHoldCount >= config.MAX_HOLDS_PER_USER) {
            throw new Error('Maximum hold limit reached');
          }
        }
      }
    }
  }

  // Create hold
  const holdId = uuidv4();
  await redisService.hset(seatHoldKey, {
    status: 'held',
    userId,
    holdId,
    heldAt: Date.now().toString(),
  });

  // Set hold expiration
  await redisService.expire(seatHoldKey, config.SEAT_HOLD_DURATION_SECONDS);

  return { holdId, seatNumber, expiresIn: config.SEAT_HOLD_DURATION_SECONDS };
}

export async function reserveSeat(
  redisService: RedisService,
  eventId: string,
  userId: string,
  seatNumber: number
) {
  const seatKey = `seat:${eventId}:${seatNumber}`;
  const seatHoldKey = `seathold:${eventId}:${seatNumber}`;

  // Use pipeline to get both seat and seat hold data in parallel
  const pipeline = redisService.createPipeline();
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
  const updatePipeline = redisService.createPipeline();
  updatePipeline.hset(seatKey, {
    status: 'reserved',
    userId,
    reservedAt: Date.now(),
  });
  updatePipeline.hincrby(`event:${eventId}`, 'availableSeats', '-1');
  await updatePipeline.exec();

  return { seatNumber, status: 'reserved' };
}

export async function getAvailableSeats(redisService: RedisService, eventId: string) {
  // Check if event exists
  const eventExists = await redisService.exists(`event:${eventId}`);
  if (!eventExists) {
    throw new Error('Event not found');
  }

  // Get all seats for the event
  const seatKeys = await redisService.keys(`seat:${eventId}:*`);
  const availableSeats = [];

  // Use pipeline to get all seat data in parallel
  const pipeline = redisService.createPipeline();
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
            seatNumber: seatData.data.seatNumber,
            status: seatData.data.status,
          });
        }
      }
    }
  }

  return { availableSeats };
}
