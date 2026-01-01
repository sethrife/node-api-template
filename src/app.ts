import 'reflect-metadata';
import Fastify, { FastifyInstance } from 'fastify';
import { registerControllers } from './utils/registerControllers';
import { HealthController } from './controllers/health.controller';
import { UserController } from './controllers/user.controller';
import {contextLoggerStorage} from "./utils/logger";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true
  });

  app.addHook('onRequest', (request, reply, done) => {
      contextLoggerStorage.run(request.log, done)
  })

  // Register all controllers
  registerControllers(app, [
    HealthController,
    UserController
  ]);

  return app;
}
