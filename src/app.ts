/// <reference path="./types/fastify.d.ts" />
import 'reflect-metadata';
import Fastify, { FastifyInstance } from 'fastify';
import redisPlugin from './plugins/redis.plugin';
import mssqlPlugin from './plugins/mssql.plugin';
import { registerControllers } from './utils/registerControllers';
import { HealthController } from './controllers/health.controller';
import { UserController } from './controllers/user.controller';
import { contextLoggerStorage } from './utils/logger';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
  });

  app.addHook('onRequest', (request, reply, done) => {
    contextLoggerStorage.run(request.log, done);
  });

  // Register Redis plugin
  await app.register(redisPlugin);

  // Register MSSQL plugin
  await app.register(mssqlPlugin);

  // Register all controllers
  registerControllers(app, [HealthController, UserController]);

  return app;
}
