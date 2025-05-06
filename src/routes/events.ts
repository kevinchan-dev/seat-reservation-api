import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { FastifyInstanceWithRedis } from '../types/index.js';

const eventSchema = z.object({
  totalSeats: z.number().min(10).max(1000),
  name: z.string().min(1),
});

type EventSchema = z.infer<typeof eventSchema>;

export default async function (fastify: FastifyInstanceWithRedis) {
  // Add custom error handler for validation errors
  fastify.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: 'Invalid input', details: error.validation });
    }
    return reply.code(500).send({ error: 'Internal server error' });
  });

  // Create a new event
  fastify.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['totalSeats', 'name'],
          properties: {
            totalSeats: { type: 'number', minimum: 10, maximum: 1000 },
            name: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request) => {
      const { totalSeats, name } = request.body as EventSchema;
      const eventId = uuidv4();

      // Store event data in Redis
      await fastify.redis.hset(`event:${eventId}`, {
        totalSeats,
        name,
        availableSeats: totalSeats,
        createdAt: Date.now(),
      });

      // Initialize seat statuses
      for (let i = 1; i <= totalSeats; i++) {
        await fastify.redis.hset(`seat:${eventId}:${i}`, {
          status: 'available',
          seatNumber: i,
          eventId,
        });
      }

      return { eventId, totalSeats, name };
    }
  );

  // Get event details
  fastify.get('/:eventId', async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const eventData = await fastify.redis.hgetall(`event:${eventId}`);

    if (!eventData || Object.keys(eventData).length === 0) {
      return reply.code(404).send({ error: 'Event not found' });
    }

    return eventData;
  });
}
