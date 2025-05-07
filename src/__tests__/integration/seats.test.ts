import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import fastifyRedis from '@fastify/redis';
import routes from '../../routes.js';
import { v4 as uuidv4 } from 'uuid';
import { FastifyInstanceWithRedis, Seat } from '../../types/index.js';

describe('Seats Routes', () => {
  let fastify: FastifyInstanceWithRedis;
  let eventId: string;
  const userId = uuidv4();

  beforeEach(async () => {
    fastify = Fastify() as FastifyInstanceWithRedis;
    await fastify.register(fastifyRedis, {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    });
    await fastify.register(routes, { prefix: '/api' });

    // Create a test event
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        name: 'Test Event',
        totalSeats: 100,
      },
    });

    const data = JSON.parse(response.payload);
    eventId = data.eventId;
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('POST /:eventId/hold', () => {
    it('should hold a seat', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: `/api/events/${eventId}/hold`,
        payload: {
          userId,
          seatNumber: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data).toHaveProperty('holdId');
      expect(data.seatNumber).toBe(1);
      expect(data.expiresIn).toBe(60);
    });

    it('should not allow holding an already held seat', async () => {
      // First hold
      await fastify.inject({
        method: 'POST',
        url: `/api/events/${eventId}/hold`,
        payload: {
          userId,
          seatNumber: 1,
        },
      });

      // Try to hold the same seat with a different user
      const response = await fastify.inject({
        method: 'POST',
        url: `/api/events/${eventId}/hold`,
        payload: {
          userId: uuidv4(),
          seatNumber: 1,
        },
      });

      expect(response.statusCode).toBe(409);
      const data = JSON.parse(response.payload);
      expect(data.error).toBe('Seat is being held by another user');
    });

    it('should enforce hold limit per user', async () => {
      // Try to hold 6 seats (limit is 5)
      for (let i = 1; i <= 6; i++) {
        const response = await fastify.inject({
          method: 'POST',
          url: `/api/events/${eventId}/hold`,
          payload: {
            userId,
            seatNumber: i,
          },
        });

        if (i === 6) {
          expect(response.statusCode).toBe(403);
          const data = JSON.parse(response.payload);
          expect(data.error).toBe('Maximum hold limit reached');
        } else {
          expect(response.statusCode).toBe(200);
        }
      }
    });
  });

  describe('POST /:eventId/reserve', () => {
    it('should reserve a seat', async () => {
      await fastify.inject({
        method: 'POST',
        url: `/api/events/${eventId}/hold`,
        payload: {
          userId,
          seatNumber: 1,
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: `/api/events/${eventId}/reserve`,
        payload: {
          userId,
          seatNumber: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.seatNumber).toBe(1);
      expect(data.status).toBe('reserved');
    });

    it('should not allow reserving an already reserved seat', async () => {
      // First reservation
      await fastify.inject({
        method: 'POST',
        url: `/api/events/${eventId}/reserve`,
        payload: {
          userId,
          seatNumber: 1,
        },
      });

      // Try to reserve the same seat
      const response = await fastify.inject({
        method: 'POST',
        url: `/api/events/${eventId}/reserve`,
        payload: {
          userId: uuidv4(),
          seatNumber: 1,
        },
      });

      expect(response.statusCode).toBe(403);
      const data = JSON.parse(response.payload);
      expect(data.error).toBe('Seat is not held');
    });
  });

  describe('GET /:eventId/available', () => {
    it('should list available seats', async () => {
      // Reserve a few seats
      await fastify.inject({
        method: 'POST',
        url: `/api/events/${eventId}/hold`,
        payload: {
          userId,
          seatNumber: 1,
        },
      });

      await fastify.inject({
        method: 'POST',
        url: `/api/events/${eventId}/reserve`,
        payload: {
          userId,
          seatNumber: 1,
        },
      });

      await fastify.inject({
        method: 'POST',
        url: `/api/events/${eventId}/hold`,
        payload: {
          userId,
          seatNumber: 2,
        },
      });

      await fastify.inject({
        method: 'POST',
        url: `/api/events/${eventId}/reserve`,
        payload: {
          userId,
          seatNumber: 2,
        },
      });

      const response = await fastify.inject({
        method: 'GET',
        url: `/api/events/${eventId}/available`,
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.availableSeats).toHaveLength(98); // 100 total - 2 reserved
      expect(data.availableSeats.every((seat: Seat) => seat.status === 'available')).toBe(true);
    });

    it('should return 404 for non-existent event', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: `/api/events/${uuidv4()}/available`,
      });

      expect(response.statusCode).toBe(404);
      const data = JSON.parse(response.payload);
      expect(data.error).toBe('Event not found');
    });
  });
});
