import { RedisService } from '../services/redis.service.js';
import { MssqlService } from '../services/mssql.service.js';
import { JWTPayload } from 'jose';

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisService;
    mssql: MssqlService;
  }

  interface FastifyRequest {
    server: FastifyInstance;
    user: JWTPayload;
  }
}

// Empty export to make this file a module
export {};
