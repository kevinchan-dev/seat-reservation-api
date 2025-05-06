import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { FastifyInstanceWithRedis } from '../types/index.js';

const HOLD_DURATION = 10; // seconds

const holdSeatSchema = z.object({
  userId: z.string().uuid(),
  seatNumber: z.number().min(1),
});

const reserveSeatSchema = z.object({
  userId: z.string().uuid(),
  seatNumber: z.number().min(1),
});

const seatDataSchema = z.object({
  status: z.enum(['available', 'reserved']),
  seatNumber: z.string(),
  eventId: z.string(),
  userId: z.string().optional(),
  heldAt: z.string().optional(),
  reservedAt: z.string().optional(),
});

const seatHoldDataSchema = z.object({
  status: z.literal('held'),
  userId: z.string(),
  holdId: z.string(),
  heldAt: z.string(),
});

export default async function (fastify: FastifyInstanceWithRedis) {
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

        // Check if event exists
        const eventExists = await fastify.redis.exists(`event:${eventId}`);
        if (!eventExists) {
          return reply.code(404).send({ error: 'Event not found' });
        }

        // Check if seat exists and is available
        const seatKey = `seat:${eventId}:${seatNumber}`;
        const rawSeatData = await fastify.redis.hgetall(seatKey);
        const seatData = seatDataSchema.safeParse(rawSeatData);

        if (!seatData.success || Object.keys(rawSeatData).length === 0) {
          return reply.code(404).send({ error: 'Seat not found' });
        }

        if (seatData.data.status !== 'available') {
          return reply.code(409).send({ error: 'Seat is not available' });
        }

        // Check if seat is being held by another user
        const seatHoldKey = `seathold:${eventId}:${seatNumber}`;
        const rawSeatHoldData = await fastify.redis.hgetall(seatHoldKey);
        const seatHoldData = seatHoldDataSchema.safeParse(rawSeatHoldData);

        if (seatHoldData.success && seatHoldData.data.userId !== userId) {
          return reply.code(409).send({ error: 'Seat is being held by another user' });
        }

        // Check if user has reached the hold limit (bonus feature)
        const userHolds = await fastify.redis.keys(`seathold:${eventId}:*`);
        let userHoldCount = 0;

        for (const key of userHolds) {
          const holdData = await fastify.redis.hgetall(key);
          if (holdData.userId === userId && holdData.status === 'held') {
            userHoldCount++;
            if (userHoldCount >= 5) {
              return reply.code(403).send({ error: 'Maximum hold limit reached' });
            }
          }
        }

        // Create hold
        const holdId = uuidv4();
        await fastify.redis.hset(seatHoldKey, {
          status: 'held',
          userId,
          holdId,
          heldAt: Date.now(),
        });

        // Set hold expiration
        await fastify.redis.expire(seatHoldKey, HOLD_DURATION);

        return { holdId, seatNumber, expiresIn: HOLD_DURATION };
      } catch (error) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Invalid input', details: error.errors });
        } else {
          reply.code(500).send({ error: 'Internal server error' });
        }
      }
    }
  );

  // Reserve a seat
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

        const seatKey = `seat:${eventId}:${seatNumber}`;
        const rawSeatData = await fastify.redis.hgetall(seatKey);
        const seatData = seatDataSchema.safeParse(rawSeatData);

        if (!seatData.success || Object.keys(rawSeatData).length === 0) {
          return reply.code(404).send({ error: 'Seat not found' });
        }

        if (seatData.data.status !== 'available') {
          return reply.code(403).send({ error: 'This seat is not available' });
        }

        // Check if seat is being held by the same user
        const seatHoldKey = `seathold:${eventId}:${seatNumber}`;
        const rawSeatHoldData = await fastify.redis.hgetall(seatHoldKey);
        const seatHoldData = seatHoldDataSchema.safeParse(rawSeatHoldData);

        if (!seatHoldData.success) {
          return reply.code(403).send({ error: 'Seat is not held' });
        }

        if (seatHoldData.data.userId !== userId) {
          return reply.code(403).send({ error: 'Seat is being held by another user' });
        }

        // Reserve the seat
        await fastify.redis.hset(seatKey, {
          status: 'reserved',
          userId,
          reservedAt: Date.now(),
        });

        // Update available seats count
        await fastify.redis.hincrby(`event:${eventId}`, 'availableSeats', -1);

        return { seatNumber, status: 'reserved' };
      } catch (error) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Invalid input', details: error.errors });
        } else {
          reply.code(500).send({ error: 'Internal server error' });
        }
      }
    }
  );

  // List available seats
  fastify.get('/:eventId/available', async (request, reply) => {
    const { eventId } = request.params as { eventId: string };

    // Check if event exists
    const eventExists = await fastify.redis.exists(`event:${eventId}`);
    if (!eventExists) {
      return reply.code(404).send({ error: 'Event not found' });
    }

    // Get all seats for the event
    const seatKeys = await fastify.redis.keys(`seat:${eventId}:*`);
    const availableSeats = [];

    for (const key of seatKeys) {
      const rawSeatData = await fastify.redis.hgetall(key);
      const seatData = seatDataSchema.safeParse(rawSeatData);

      if (seatData.success && seatData.data.status === 'available') {
        availableSeats.push({
          seatNumber: parseInt(seatData.data.seatNumber),
          status: seatData.data.status,
        });
      }
    }

    return { availableSeats };
  });
}
