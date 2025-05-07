import * as eventService from './eventService.js';
import { RedisService } from './redisService.js';
import Redis from 'ioredis-mock';

describe('EventService', () => {
  let redisService: RedisService;
  let redis: InstanceType<typeof Redis>;

  beforeEach(() => {
    redis = new Redis();
    redisService = new RedisService(redis);
  });

  afterEach(async () => {
    await redis.flushall();
  });

  describe('createEvent', () => {
    it('should create an event with seats', async () => {
      const name = 'Test Event';
      const totalSeats = 10;

      const result = await eventService.createEvent(redisService, name, totalSeats);

      expect(result).toMatchObject({
        name,
        totalSeats,
        availableSeats: totalSeats,
      });
      expect(result.eventId).toBeDefined();
      expect(result.createdAt).toBeDefined();

      // Verify event data in Redis
      const eventData = await redis.hgetall(`event:${result.eventId}`);
      expect(eventData).toMatchObject({
        name,
        totalSeats: totalSeats.toString(),
        availableSeats: totalSeats.toString(),
      });

      // Verify seats were created
      const seatKeys = await redis.keys(`seat:${result.eventId}:*`);
      expect(seatKeys).toHaveLength(totalSeats);

      for (let i = 1; i <= totalSeats; i++) {
        const seatData = await redis.hgetall(`seat:${result.eventId}:${i}`);
        expect(seatData).toMatchObject({
          status: 'available',
          seatNumber: i.toString(),
          eventId: result.eventId,
        });
      }
    });
  });

  describe('getEvent', () => {
    it('should return event data', async () => {
      const name = 'Test Event';
      const totalSeats = 10;
      const event = await eventService.createEvent(redisService, name, totalSeats);

      const result = await eventService.getEvent(redisService, event.eventId);

      expect(result).toMatchObject({
        name,
        totalSeats,
        availableSeats: totalSeats,
      });
    });
  });

  describe('listEvents', () => {
    it('should return all events', async () => {
      const event1 = await eventService.createEvent(redisService, 'Event 1', 10);
      const event2 = await eventService.createEvent(redisService, 'Event 2', 20);

      const result = await eventService.listEvents(redisService);

      expect(result.events).toHaveLength(2);
      expect(result.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventId: event1.eventId,
            name: 'Event 1',
            totalSeats: 10,
          }),
          expect.objectContaining({
            eventId: event2.eventId,
            name: 'Event 2',
            totalSeats: 20,
          }),
        ])
      );
    });

    it('should return empty array if no events', async () => {
      const result = await eventService.listEvents(redisService);
      expect(result.events).toHaveLength(0);
    });
  });

  describe('deleteEvent', () => {
    it('should delete event and related data', async () => {
      const event = await eventService.createEvent(redisService, 'Test Event', 10);

      await eventService.deleteEvent(redisService, event.eventId);

      // Verify event is deleted
      const eventExists = await redis.exists(`event:${event.eventId}`);
      expect(eventExists).toBe(0);

      // Verify seats are deleted
      const seatKeys = await redis.keys(`seat:${event.eventId}:*`);
      expect(seatKeys).toHaveLength(0);
    });

    it('should throw error if event not found', async () => {
      await expect(eventService.deleteEvent(redisService, 'non-existent')).rejects.toThrow('Event not found');
    });
  });
});
