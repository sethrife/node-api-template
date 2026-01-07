import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { RouteSchema } from '../decorators/schema.decorator.js';

/**
 * Creates a Fastify preHandler that validates request data against Zod schemas
 *
 * @param schema - RouteSchema containing Zod validators for body, params, querystring, and/or headers
 * @returns Fastify preHandler function
 */
export function createValidationPrehandler(schema: RouteSchema) {
  return async function validateRequest(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Validate each part of the request if schema exists
      if (schema.body) {
        request.body = schema.body.parse(request.body);
      }
      if (schema.params) {
        request.params = schema.params.parse(request.params);
      }
      if (schema.querystring) {
        request.query = schema.querystring.parse(request.query);
      }
      if (schema.headers) {
        request.headers = schema.headers.parse(request.headers);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        // Log validation errors for debugging
        request.log.warn({ validationErrors: error.issues }, 'Request validation failed');

        // Return detailed validation error response
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: error.issues.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
            code: e.code
          }))
        });
      }
      // Re-throw non-validation errors to Fastify error handler
      throw error;
    }
  };
}
