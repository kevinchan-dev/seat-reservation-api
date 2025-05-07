import { z } from 'zod';
import { FastifyInstanceWithRedis } from './types/index.js';
import { RedisService } from './services/redisService.js';
import * as eventService from './services/eventService.js';
import * as seatService from './services/seatService.js';

// Event schemas
const createEventSchema = {
  body: {
    type: 'object',
    required: ['name', 'totalSeats'],
    properties: {
      name: { type: 'string', minLength: 1 },
      totalSeats: { type: 'number', minimum: 1, maximum: 1000 },
    },
  },
};

const getEventSchema = {
  params: {
    type: 'object',
    required: ['eventId'],
    properties: {
      eventId: { type: 'string' },
    },
  },
};

const listEventsSchema = {};

const deleteEventSchema = {
  params: {
    type: 'object',
    required: ['eventId'],
    properties: {
      eventId: { type: 'string' },
    },
  },
};

// Seat schemas
const holdSeatSchema = z.object({
  userId: z.string().uuid(),
  seatNumber: z.number().min(1),
});

const reserveSeatSchema = z.object({
  userId: z.string().uuid(),
  seatNumber: z.number().min(1),
});

export default async function routes(fastify: FastifyInstanceWithRedis) {
  const redisService = new RedisService(fastify.redis);

  // Event routes
  fastify.post('/events', {
    schema: createEventSchema,
    handler: async (request, reply) => {
      const { name, totalSeats } = request.body as { name: string; totalSeats: number };
      const event = await eventService.createEvent(redisService, name, totalSeats);
      return reply.code(201).send(event);
    },
  });

  fastify.get('/events/:eventId', {
    schema: getEventSchema,
    handler: async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      const event = await eventService.getEvent(redisService, eventId);
      if (!event) {
        return reply.code(404).send({ error: 'Event not found' });
      }
      return reply.send(event);
    },
  });

  fastify.get('/events', {
    schema: listEventsSchema,
    handler: async (request, reply) => {
      const events = await eventService.listEvents(redisService);
      return reply.send(events);
    },
  });

  fastify.delete('/events/:eventId', {
    schema: deleteEventSchema,
    handler: async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      await eventService.deleteEvent(redisService, eventId);
      return reply.code(204).send();
    },
  });

  // Seat routes
  fastify.post('/events/:eventId/hold', {
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
    handler: async (request, reply) => {
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
    },
  });

  fastify.post('/events/:eventId/reserve', {
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
    handler: async (request, reply) => {
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
    },
  });

  fastify.get('/events/:eventId/available', {
    handler: async (request, reply) => {
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
    },
  });
}
