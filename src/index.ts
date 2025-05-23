import Fastify from 'fastify';
import fastifyRedis from '@fastify/redis';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import routes from './routes.js';
import { FastifyInstanceWithRedis } from './types/index.js';
import { config } from './config.js';

const start = async () => {
  const fastify = Fastify() as FastifyInstanceWithRedis;

  // Register Redis plugin
  await fastify.register(fastifyRedis, {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
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
    routePrefix: '/swagger',
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
  await fastify.register(routes, { prefix: '/api' });

  try {
    await fastify.listen({ port: 8080, host: '0.0.0.0' });
    console.log('Server is running on port 8080');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
