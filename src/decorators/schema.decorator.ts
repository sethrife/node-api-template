import { z } from 'zod';

/**
 * Schema definition for route validation
 * Each property corresponds to a part of the HTTP request that can be validated
 */
export interface RouteSchema {
  body?: z.ZodType<any>;
  params?: z.ZodType<any>;
  querystring?: z.ZodType<any>;
  headers?: z.ZodType<any>;
}

/**
 * Decorator to attach Zod validation schemas to route handlers
 *
 * @example
 * ```typescript
 * @Post('/')
 * @Schema({
 *   body: z.object({
 *     name: z.string().min(1),
 *     email: z.string().email()
 *   })
 * })
 * async createUser(request: FastifyRequest, reply: FastifyReply) {
 *   // request.body is validated and typed
 * }
 * ```
 */
export function Schema(schema: RouteSchema) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata('schema', schema, target, propertyKey);
    return descriptor;
  };
}
