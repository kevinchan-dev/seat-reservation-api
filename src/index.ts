import Fastify from 'fastify';
import fastifyRedis from '@fastify/redis';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import eventsRoutes from './routes/events.js';
import seatsRoutes from './routes/seats.js';
import { FastifyInstanceWithRedis } from './types/index.js';

const start = async () => {
  const fastify = Fastify() as FastifyInstanceWithRedis;

  // Register Redis plugin
  await fastify.register(fastifyRedis, {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  });

  // Register Swagger
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Seat Reservation API',
        description: 'API for managing seat reservations',
        version: '1.0.0',
      },
    },
  });
  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
    uiHooks: {
      onRequest: function (request, reply, next) {
        next();
      },
      preHandler: function (request, reply, next) {
        next();
      },
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  // Register routes
  await fastify.register(eventsRoutes, { prefix: '/api/events' });
  await fastify.register(seatsRoutes, { prefix: '/api/seats' });

  try {
    await fastify.listen({ port: 8080, host: '0.0.0.0' });
    console.log('Server is running on port 8080');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
