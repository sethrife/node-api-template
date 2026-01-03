import { RedisService } from '../services/redis.service';
import { MssqlService } from '../services/mssql.service';

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisService;
    mssql: MssqlService;
  }

  interface FastifyRequest {
    server: FastifyInstance;
  }
}

// Empty export to make this file a module
export {};
