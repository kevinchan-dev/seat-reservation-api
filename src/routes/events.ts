import { FastifyInstance } from 'fastify';
import { FastifyInstanceWithRedis } from '../types/index.js';
import * as eventService from '../services/eventService.js';
import { RedisService } from '../services/redisService.js';

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

export default async function eventsRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify as FastifyInstanceWithRedis;
  if (!typedFastify.redis) {
    throw new Error('Redis not initialized');
  }

  const redisService = new RedisService(typedFastify.redis);

  fastify.post('/', {
    schema: createEventSchema,
    handler: async (request, reply) => {
      const { name, totalSeats } = request.body as { name: string; totalSeats: number };
      const event = await eventService.createEvent(redisService, name, totalSeats);
      return reply.code(201).send(event);
    },
  });

  fastify.get('/:eventId', {
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

  fastify.get('/', {
    schema: listEventsSchema,
    handler: async (request, reply) => {
      const events = await eventService.listEvents(redisService);
      return reply.send(events);
    },
  });

  fastify.delete('/:eventId', {
    schema: deleteEventSchema,
    handler: async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      await eventService.deleteEvent(redisService, eventId);
      return reply.code(204).send();
    },
  });
}
