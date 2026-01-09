import { RedisService } from '../services/redis.service.js';
import { MssqlService } from '../services/mssql.service.js';
import { JWTPayload } from 'jose';

/**
 * Request context data interface
 * Use with @fastify/request-context to store computed/derived data
 */
export interface RequestContextData {
  // Add your computed data properties here
  // Examples:
  userId?: string;              // Derived from request.user.sub
  tenantId?: string;            // Derived from request headers or JWT
  permissions?: string[];       // Computed from user roles/scopes
  // Add more properties as needed
}

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

declare module '@fastify/request-context' {
  interface RequestContextData {
    userId?: string;
    tenantId?: string;
    permissions?: string[];
  }
}

// Empty export to make this file a module
export {};
