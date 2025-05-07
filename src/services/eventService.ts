import { RedisService, BatchSetEntry } from './redisService.js';
import { z } from 'zod';

export const eventSchema = z.object({
  name: z.string().min(1),
  totalSeats: z.number().int().min(1).max(1000),
  availableSeats: z.number().int().min(0),
  createdAt: z.number(),
});

export type Event = z.infer<typeof eventSchema>;

export const seatSchema = z.object({
  status: z.enum(['available', 'reserved', 'held']),
  seatNumber: z.string(),
  eventId: z.string(),
});

export type Seat = z.infer<typeof seatSchema>;

export async function createEvent(redisService: RedisService, name: string, totalSeats: number) {
  const eventId = crypto.randomUUID();
  const now = Date.now();

  // Create event and seats using batch operations
  const entries: BatchSetEntry[] = [
    {
      key: redisService.getEventKey(eventId),
      data: {
        name,
        totalSeats,
        availableSeats: totalSeats,
        createdAt: now,
      },
    },
  ];

  // Add seat entries
  for (let i = 1; i <= totalSeats; i++) {
    entries.push({
      key: redisService.getSeatKey(eventId, i),
      data: {
        status: 'available',
        seatNumber: i.toString(),
        eventId,
      },
    });
  }

  await redisService.batchSet(entries);

  const event = eventSchema.parse({
    name,
    totalSeats,
    availableSeats: totalSeats,
    createdAt: now,
  });

  return {
    eventId,
    ...event,
  };
}

export async function getEvent(redisService: RedisService, eventId: string) {
  const eventKey = redisService.getEventKey(eventId);
  const rawEventData = await redisService.hgetall(eventKey);

  if (!rawEventData || Object.keys(rawEventData).length === 0) {
    return null;
  }

  // Parse and validate the event data
  const event = eventSchema.parse({
    name: rawEventData.name,
    totalSeats: parseInt(rawEventData.totalSeats, 10),
    availableSeats: parseInt(rawEventData.availableSeats, 10),
    createdAt: parseInt(rawEventData.createdAt, 10),
  });

  return {
    eventId,
    ...event,
  };
}

export async function listEvents(redisService: RedisService) {
  const eventKeys = await redisService.keys('event:*');
  const events = [];

  const eventData = await redisService.batchGet(eventKeys);
  for (const [key, data] of Object.entries(eventData)) {
    if (data && Object.keys(data).length > 0) {
      const eventId = key.split(':')[1];
      // Parse and validate each event
      const event = eventSchema.parse({
        name: data.name,
        totalSeats: parseInt(data.totalSeats, 10),
        availableSeats: parseInt(data.availableSeats, 10),
        createdAt: parseInt(data.createdAt, 10),
      });
      events.push({
        eventId,
        ...event,
      });
    }
  }

  return { events };
}

export async function deleteEvent(redisService: RedisService, eventId: string) {
  // Check if event exists
  const eventKey = redisService.getEventKey(eventId);
  const eventExists = await redisService.exists(eventKey);
  if (!eventExists) {
    throw new Error('Event not found');
  }

  // Get all related keys
  const seatKeys = await redisService.keys(`seat:${eventId}:*`);
  const holdKeys = await redisService.keys(`seathold:${eventId}:*`);

  // Delete all related data using batch delete
  const keysToDelete = [eventKey, ...seatKeys, ...holdKeys];
  await redisService.batchDelete(keysToDelete);

  return { message: 'Event deleted successfully' };
}
