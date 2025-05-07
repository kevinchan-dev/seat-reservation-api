import fp from 'fastify-plugin';
import { FastifyInstanceWithRedis } from '../types/index.js';
import { RedisService } from '../services/redisService.js';
import { createEvent, getEvent, listEvents, deleteEvent } from '../services/eventService.js';
import { holdSeat, reserveSeat, getAvailableSeats } from '../services/seatService.js';

export default fp(async (fastify: FastifyInstanceWithRedis) => {
  const redisService = new RedisService(fastify.redis.redis);
  fastify.eventService = {
    createEvent: (name: string, totalSeats: number) => createEvent(redisService, name, totalSeats),
    getEvent: (eventId: string) => getEvent(redisService, eventId),
    listEvents: () => listEvents(redisService),
    deleteEvent: (eventId: string) => deleteEvent(redisService, eventId),
  };
  fastify.seatService = {
    holdSeat: (eventId: string, userId: string, seatNumber: number) =>
      holdSeat(redisService, eventId, userId, seatNumber),
    reserveSeat: (eventId: string, userId: string, seatNumber: number) =>
      reserveSeat(redisService, eventId, userId, seatNumber),
    getAvailableSeats: (eventId: string) => getAvailableSeats(redisService, eventId),
  };
});
