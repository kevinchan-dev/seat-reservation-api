import { z } from 'zod';
import { RedisService, BatchSetEntry, RedisHashData } from './redisService.js';

const eventSchema = z.object({
  name: z.string(),
  totalSeats: z.coerce.number().min(1).max(1000),
  availableSeats: z.coerce.number().min(0),
  createdAt: z.coerce.number(),
});

export class EventService {
  constructor(private readonly redisService: RedisService) {}

  async createEvent(name: string, totalSeats: number) {
    const eventId = crypto.randomUUID();
    const now = Date.now();

    // Create event and seats using batch operations
    const entries: BatchSetEntry[] = [
      {
        key: this.redisService.getEventKey(eventId),
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
        key: this.redisService.getSeatKey(eventId, i),
        data: {
          status: 'available',
          seatNumber: i.toString(),
          eventId,
        },
      });
    }

    await this.redisService.batchSet(entries);

    return {
      eventId,
      name,
      totalSeats,
      availableSeats: totalSeats,
      createdAt: now,
    };
  }

  async getEvent(eventId: string) {
    const eventKey = this.redisService.getEventKey(eventId);
    const rawEventData = await this.redisService.hgetall(eventKey);
    const eventData = eventSchema.safeParse(rawEventData);
    if (!eventData.success) {
      throw new Error('Event not found');
    }

    return eventData.data;
  }

  async listEvents() {
    const eventKeys = await this.redisService.keys('event:*');
    const events = [];

    const eventData = await this.redisService.batchGet(eventKeys);
    for (const [key, data] of Object.entries(eventData)) {
      const eventData = eventSchema.safeParse(data);
      if (eventData.success) {
        const eventId = key.split(':')[1];
        events.push({
          eventId,
          ...eventData.data,
        });
      }
    }

    return { events };
  }

  async deleteEvent(eventId: string) {
    // Check if event exists
    const eventKey = this.redisService.getEventKey(eventId);
    const eventExists = await this.redisService.exists(eventKey);
    if (!eventExists) {
      throw new Error('Event not found');
    }

    // Get all related keys
    const seatKeys = await this.redisService.keys(`seat:${eventId}:*`);
    const holdKeys = await this.redisService.keys(`seathold:${eventId}:*`);

    // Delete all related data using batch delete
    const keysToDelete = [eventKey, ...seatKeys, ...holdKeys];
    await this.redisService.batchDelete(keysToDelete);

    return { message: 'Event deleted successfully' };
  }
}
