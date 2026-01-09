/// <reference path="./types/fastify.d.ts" />
import 'reflect-metadata';
import Fastify, { FastifyInstance } from 'fastify';
import requestContext from '@fastify/request-context';
import redisPlugin from './plugins/redis.plugin.js';
import mssqlPlugin from './plugins/mssql.plugin.js';
import { registerControllers } from './utils/registerControllers.js';
import { HealthController } from './controllers/health.controller.js';
import { UserController } from './controllers/user.controller.js';
import { ProtectedController } from './controllers/protected.controller.js';
import { contextLoggerStorage } from './utils/logger.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
  });

  app.addHook('onRequest', (request, reply, done) => {
    contextLoggerStorage.run(request.log, done);
  });

  // Register plugins
  await app.register(requestContext);
  await app.register(redisPlugin);
  await app.register(mssqlPlugin);

  // Register controllers
  registerControllers(app, [HealthController, UserController, ProtectedController]);

  return app;
}
