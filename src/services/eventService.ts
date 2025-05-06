import { z } from 'zod';
import { RedisService } from './redisService.js';

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

    // Create event
    await this.redisService.hset(`event:${eventId}`, {
      name,
      totalSeats,
      availableSeats: totalSeats,
      createdAt: now,
    });

    // Create seats
    const seatPromises = Array.from({ length: totalSeats }, (_, i) => {
      const seatNumber = i + 1;
      return this.redisService.hset(`seat:${eventId}:${seatNumber}`, {
        status: 'available',
        seatNumber: seatNumber.toString(),
        eventId,
      });
    });

    await Promise.all(seatPromises);

    return {
      eventId,
      name,
      totalSeats,
      availableSeats: totalSeats,
      createdAt: now,
    };
  }

  async getEvent(eventId: string) {
    const rawEventData = await this.redisService.hgetall(`event:${eventId}`);
    const eventData = eventSchema.safeParse(rawEventData);
    if (!eventData.success) {
      throw new Error('Event not found');
    }

    return eventData.data;
  }

  async listEvents() {
    const eventKeys = await this.redisService.keys('event:*');
    const events = [];

    for (const key of eventKeys) {
      const rawEventData = await this.redisService.hgetall(key);
      const eventData = eventSchema.safeParse(rawEventData);

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
    const eventExists = await this.redisService.exists(`event:${eventId}`);
    if (!eventExists) {
      throw new Error('Event not found');
    }

    // Get all related keys
    const seatKeys = await this.redisService.keys(`seat:${eventId}:*`);
    const holdKeys = await this.redisService.keys(`seathold:${eventId}:*`);

    // Delete all related data
    const deletePromises = [
      this.redisService.del(`event:${eventId}`),
      ...seatKeys.map((key) => this.redisService.del(key)),
      ...holdKeys.map((key) => this.redisService.del(key)),
    ];

    await Promise.all(deletePromises);

    return { message: 'Event deleted successfully' };
  }
}
