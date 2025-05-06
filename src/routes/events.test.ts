import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import fastifyRedis from '@fastify/redis';
import eventsRoutes from './events.js';
import { v4 as uuidv4 } from 'uuid';
import { FastifyInstanceWithRedis } from './../types/index.js';

describe('Events Routes', () => {
  let fastify: FastifyInstanceWithRedis;

  beforeEach(async () => {
    fastify = Fastify() as FastifyInstanceWithRedis;
    await fastify.register(fastifyRedis, {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    });

    await fastify.register(eventsRoutes, { prefix: '/api/events' });
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('POST /', () => {
    it('should create a new event', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          name: 'Test Event',
          totalSeats: 100,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data).toHaveProperty('eventId');
      expect(data.name).toBe('Test Event');
      expect(data.totalSeats).toBe(100);
    });

    it('should validate minimum seats', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          name: 'Test Event',
          totalSeats: 0,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate maximum seats', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          name: 'Test Event',
          totalSeats: 2000,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /:eventId', () => {
    it('should return event details', async () => {
      // Create an event first
      const createResponse = await fastify.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          name: 'Test Event',
          totalSeats: 100,
        },
      });

      const { eventId } = JSON.parse(createResponse.payload);

      const response = await fastify.inject({
        method: 'GET',
        url: `/api/events/${eventId}`,
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.name).toBe('Test Event');
    });

    it('should return 404 for non-existent event', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: `/api/events/${uuidv4()}`,
      });

      expect(response.statusCode).toBe(404);
      const data = JSON.parse(response.payload);
      expect(data.error).toBe('Event not found');
    });
  });
});
