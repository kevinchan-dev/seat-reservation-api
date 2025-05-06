import { SeatService } from './seatService.js';
import { RedisService } from './redisService.js';
import Redis from 'ioredis-mock';

describe('SeatService', () => {
  let redisService: RedisService;
  let seatService: SeatService;
  let redis: InstanceType<typeof Redis>;
  let eventId: string;
  const userId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    redis = new Redis();
    redisService = new RedisService(redis);
    seatService = new SeatService(redisService);

    // Create a test event
    eventId = 'test-event';
    await redis.hset(`event:${eventId}`, {
      name: 'Test Event',
      totalSeats: '10',
      availableSeats: '10',
      createdAt: Date.now(),
    });

    // Create test seats
    for (let i = 1; i <= 10; i++) {
      await redis.hset(`seat:${eventId}:${i}`, {
        status: 'available',
        seatNumber: i.toString(),
        eventId,
      });
    }
  });

  afterEach(async () => {
    await redis.flushall();
  });

  describe('holdSeat', () => {
    it('should hold a seat successfully', async () => {
      const seatNumber = 1;
      const result = await seatService.holdSeat(eventId, userId, seatNumber);

      expect(result).toMatchObject({
        holdId: expect.any(String),
        seatNumber,
        expiresIn: 10,
      });

      // Verify hold data in Redis
      const holdData = await redis.hgetall(`seathold:${eventId}:${seatNumber}`);
      expect(holdData).toMatchObject({
        status: 'held',
        userId,
        heldAt: expect.any(String),
      });
    });

    it('should throw error if event not found', async () => {
      await expect(seatService.holdSeat('non-existent', userId, 1)).rejects.toThrow(
        'Event not found'
      );
    });

    it('should throw error if seat not found', async () => {
      await expect(seatService.holdSeat(eventId, userId, 999)).rejects.toThrow('Seat not found');
    });

    it('should throw error if seat is not available', async () => {
      // Make seat reserved
      await redis.hset(`seat:${eventId}:1`, {
        status: 'reserved',
        seatNumber: '1',
        eventId,
      });

      await expect(seatService.holdSeat(eventId, userId, 1)).rejects.toThrow(
        'Seat is not available'
      );
    });

    it('should throw error if seat is held by another user', async () => {
      const otherUserId = '123e4567-e89b-12d3-a456-426614174001';
      await redis.hset(`seathold:${eventId}:1`, {
        status: 'held',
        userId: otherUserId,
        holdId: 'test-hold',
        heldAt: Date.now(),
      });

      await expect(seatService.holdSeat(eventId, userId, 1)).rejects.toThrow(
        'Seat is being held by another user'
      );
    });

    it('should throw error if user has reached hold limit', async () => {
      // Create 5 holds for the user
      for (let i = 1; i <= 5; i++) {
        await redis.hset(`seathold:${eventId}:${i}`, {
          status: 'held',
          userId,
          holdId: `hold-${i}`,
          heldAt: Date.now(),
        });
      }

      await expect(seatService.holdSeat(eventId, userId, 6)).rejects.toThrow(
        'Maximum hold limit reached'
      );
    });
  });

  describe('reserveSeat', () => {
    it('should reserve a held seat successfully', async () => {
      const seatNumber = 1;
      // First hold the seat
      await seatService.holdSeat(eventId, userId, seatNumber);

      const result = await seatService.reserveSeat(eventId, userId, seatNumber);

      expect(result).toMatchObject({
        seatNumber,
        status: 'reserved',
      });

      // Verify seat is reserved
      const seatData = await redis.hgetall(`seat:${eventId}:${seatNumber}`);
      expect(seatData).toMatchObject({
        status: 'reserved',
        userId,
      });

      // Verify available seats count is updated
      const eventData = await redis.hgetall(`event:${eventId}`);
      expect(eventData.availableSeats).toBe('9');
    });

    it('should throw error if seat is not held', async () => {
      await expect(seatService.reserveSeat(eventId, userId, 1)).rejects.toThrow('Seat is not held');
    });

    it('should throw error if seat is held by another user', async () => {
      const otherUserId = '123e4567-e89b-12d3-a456-426614174001';
      await redis.hset(`seathold:${eventId}:1`, {
        status: 'held',
        userId: otherUserId,
        holdId: 'test-hold',
        heldAt: Date.now(),
      });

      await expect(seatService.reserveSeat(eventId, userId, 1)).rejects.toThrow(
        'Seat is held by another user'
      );
    });
  });

  describe('getAvailableSeats', () => {
    it('should return available seats', async () => {
      // Make some seats reserved
      await redis.hset(`seat:${eventId}:1`, {
        status: 'reserved',
        seatNumber: '1',
        eventId,
      });

      const result = await seatService.getAvailableSeats(eventId);

      expect(result.availableSeats).toHaveLength(9);
      expect(result.availableSeats).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            seatNumber: expect.any(Number),
            status: 'available',
          }),
        ])
      );
    });

    it('should throw error if event not found', async () => {
      await expect(seatService.getAvailableSeats('non-existent')).rejects.toThrow(
        'Event not found'
      );
    });
  });
});
