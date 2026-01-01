import 'reflect-metadata';
import Fastify, { FastifyInstance } from 'fastify';
import { registerControllers } from './utils/registerControllers';
import { HealthController } from './controllers/health.controller';
import { UserController } from './controllers/user.controller';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true
  });

  // Register all controllers
  registerControllers(app, [
    HealthController,
    UserController
  ]);

  return app;
}
