import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FastifyInstanceWithRedis } from '../types/index.js';

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
  if (!typedFastify.eventService) {
    throw new Error('EventService not initialized');
  }

  fastify.post('/', {
    schema: createEventSchema,
    handler: async (request, reply) => {
      const { name, totalSeats } = request.body as { name: string; totalSeats: number };
      const event = await typedFastify.eventService!.createEvent(name, totalSeats);
      return reply.code(201).send(event);
    },
  });

  fastify.get('/:eventId', {
    schema: getEventSchema,
    handler: async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      const event = await typedFastify.eventService!.getEvent(eventId);
      return reply.send(event);
    },
  });

  fastify.get('/', {
    schema: listEventsSchema,
    handler: async (request, reply) => {
      const events = await typedFastify.eventService!.listEvents();
      return reply.send(events);
    },
  });

  fastify.delete('/:eventId', {
    schema: deleteEventSchema,
    handler: async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      await typedFastify.eventService!.deleteEvent(eventId);
      return reply.code(204).send();
    },
  });
}
