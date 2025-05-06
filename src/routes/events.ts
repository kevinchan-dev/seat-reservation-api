import { z } from 'zod';
import { FastifyInstanceWithRedis } from '../types/index.js';
import { EventService } from '../services/eventService.js';
import { RedisService } from '../services/redisService.js';

const createEventSchema = z.object({
  name: z.string().min(1),
  totalSeats: z.number().min(1).max(1000),
});

export default async function (fastify: FastifyInstanceWithRedis) {
  const redisService = new RedisService(fastify.redis);
  const eventService = new EventService(redisService);

  // Create event
  fastify.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'totalSeats'],
          properties: {
            name: { type: 'string', minLength: 1 },
            totalSeats: { type: 'number', minimum: 1, maximum: 1000 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name, totalSeats } = createEventSchema.parse(request.body);
        const result = await eventService.createEvent(name, totalSeats);
        return result;
      } catch (error) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Invalid input', details: error.errors });
        } else {
          reply.code(500).send({ error: 'Internal server error' });
        }
      }
    }
  );

  // Get event
  fastify.get('/:eventId', async (request, reply) => {
    try {
      const { eventId } = request.params as { eventId: string };
      const result = await eventService.getEvent(eventId);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        const statusCode = error.message.includes('not found') ? 404 : 500;
        reply.code(statusCode).send({ error: error.message });
      } else {
        reply.code(500).send({ error: 'Internal server error' });
      }
    }
  });

  // List events
  fastify.get('/', async (request, reply) => {
    try {
      const result = await eventService.listEvents();
      return result;
    } catch (error) {
      reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Delete event
  fastify.delete('/:eventId', async (request, reply) => {
    try {
      const { eventId } = request.params as { eventId: string };
      const result = await eventService.deleteEvent(eventId);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        const statusCode = error.message.includes('not found') ? 404 : 500;
        reply.code(statusCode).send({ error: error.message });
      } else {
        reply.code(500).send({ error: 'Internal server error' });
      }
    }
  });
}
