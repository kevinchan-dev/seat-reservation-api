import fp from 'fastify-plugin';
import { FastifyInstanceWithRedis } from '../types/index.js';
import { RedisService } from '../services/redisService.js';
import { EventService } from '../services/eventService.js';

export default fp(async (fastify: FastifyInstanceWithRedis) => {
  const redisService = new RedisService(fastify.redis);
  fastify.eventService = new EventService(redisService);
});
