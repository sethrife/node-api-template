import { RedisService } from '../services/redis.service';

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisService;
  }

  interface FastifyRequest {
    server: FastifyInstance;
  }
}

// Empty export to make this file a module
export {};
