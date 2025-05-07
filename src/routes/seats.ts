import { z } from 'zod';
import { FastifyInstanceWithRedis } from '../types/index.js';
import { RedisService } from '../services/redisService.js';
import * as seatService from '../services/seatService.js';

const holdSeatSchema = z.object({
  userId: z.string().uuid(),
  seatNumber: z.number().min(1),
});

const reserveSeatSchema = z.object({
  userId: z.string().uuid(),
  seatNumber: z.number().min(1),
});

export default async function (fastify: FastifyInstanceWithRedis) {
  const redisService = new RedisService(fastify.redis);

  // Hold a seat
  fastify.post(
    '/:eventId/hold',
    {
      schema: {
        body: {
          type: 'object',
          required: ['userId', 'seatNumber'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
            seatNumber: { type: 'number', minimum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { eventId } = request.params as { eventId: string };
        const { userId, seatNumber } = holdSeatSchema.parse(request.body);

        const result = await seatService.holdSeat(redisService, eventId, userId, seatNumber);
        return result;
      } catch (error) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Invalid input', details: error.errors });
        } else if (error instanceof Error) {
          const statusCode = error.message.includes('not found')
            ? 404
            : error.message.includes('not available')
              ? 409
              : error.message.includes('held by another user')
                ? 409
                : error.message.includes('Maximum hold limit')
                  ? 403
                  : 500;
          reply.code(statusCode).send({ error: error.message });
        } else {
          reply.code(500).send({ error: 'Internal server error' });
        }
      }
    }
  );

  // Reserve a held seat
  fastify.post(
    '/:eventId/reserve',
    {
      schema: {
        body: {
          type: 'object',
          required: ['userId', 'seatNumber'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
            seatNumber: { type: 'number', minimum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { eventId } = request.params as { eventId: string };
        const { userId, seatNumber } = reserveSeatSchema.parse(request.body);

        const result = await seatService.reserveSeat(redisService, eventId, userId, seatNumber);
        return result;
      } catch (error) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Invalid input', details: error.errors });
        } else if (error instanceof Error) {
          const statusCode = error.message.includes('not found')
            ? 404
            : error.message.includes('not available')
              ? 403
              : error.message.includes('not held')
                ? 403
                : error.message.includes('held by another user')
                  ? 403
                  : 500;
          reply.code(statusCode).send({ error: error.message });
        } else {
          reply.code(500).send({ error: 'Internal server error' });
        }
      }
    }
  );

  // List available seats
  fastify.get('/:eventId/available', async (request, reply) => {
    try {
      const { eventId } = request.params as { eventId: string };
      const result = await seatService.getAvailableSeats(redisService, eventId);
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
