import { createValidationPrehandler } from '../../src/utils/validation.js';
import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

interface MockReply {
  statusCode: number;
  body: any;
  status: jest.Mock;
  send: jest.Mock;
}

function createMockRequest(data: {
  body?: any;
  params?: any;
  query?: any;
  headers?: any;
}): FastifyRequest {
  return {
    body: data.body,
    params: data.params,
    query: data.query,
    headers: data.headers ?? {},
    log: {
      warn: jest.fn(),
    },
  } as unknown as FastifyRequest;
}

function createMockReply(): MockReply {
  const reply: MockReply = {
    statusCode: 200,
    body: null,
    status: jest.fn(),
    send: jest.fn(),
  };
  reply.status.mockImplementation((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.send.mockImplementation((body: any) => {
    reply.body = body;
    return reply;
  });
  return reply;
}

describe('createValidationPrehandler', () => {
  describe('body validation', () => {
    it('should validate and parse body successfully', async () => {
      const schema = {
        body: z.object({
          name: z.string(),
          age: z.number(),
        }),
      };
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        body: { name: 'John', age: 30 },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(request.body).toEqual({ name: 'John', age: 30 });
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should return 400 when body validation fails', async () => {
      const schema = {
        body: z.object({
          name: z.string(),
          age: z.number(),
        }),
      };
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        body: { name: 'John', age: 'not a number' },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
      });
      expect(reply.body.details).toBeDefined();
      expect(reply.body.details.length).toBeGreaterThan(0);
    });

    it('should transform body with Zod transformations', async () => {
      const schema = {
        body: z.object({
          name: z.string().trim().toLowerCase(),
        }),
      };
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        body: { name: '  JOHN  ' },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(request.body).toEqual({ name: 'john' });
    });
  });

  describe('params validation', () => {
    it('should validate and parse params successfully', async () => {
      const schema = {
        params: z.object({
          id: z.string().uuid(),
        }),
      };
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(request.params).toEqual({ id: '550e8400-e29b-41d4-a716-446655440000' });
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should return 400 when params validation fails', async () => {
      const schema = {
        params: z.object({
          id: z.string().uuid(),
        }),
      };
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        params: { id: 'not-a-uuid' },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.body.details[0].path).toBe('id');
    });
  });

  describe('querystring validation', () => {
    it('should validate and parse querystring successfully', async () => {
      const schema = {
        querystring: z.object({
          page: z.coerce.number().min(1),
          limit: z.coerce.number().max(100),
        }),
      };
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        query: { page: '1', limit: '10' },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(request.query).toEqual({ page: 1, limit: 10 });
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should return 400 when querystring validation fails', async () => {
      const schema = {
        querystring: z.object({
          page: z.coerce.number().min(1),
        }),
      };
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        query: { page: '0' },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('headers validation', () => {
    it('should validate and parse headers successfully', async () => {
      const schema = {
        headers: z.object({
          'x-api-key': z.string().min(10),
        }),
      };
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        headers: { 'x-api-key': 'my-secret-api-key' },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(request.headers).toEqual({ 'x-api-key': 'my-secret-api-key' });
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should return 400 when headers validation fails', async () => {
      const schema = {
        headers: z.object({
          'x-api-key': z.string().min(10),
        }),
      };
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        headers: { 'x-api-key': 'short' },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('multiple schema validation', () => {
    it('should validate all parts of request', async () => {
      const schema = {
        body: z.object({ name: z.string() }),
        params: z.object({ id: z.string() }),
        querystring: z.object({ expand: z.string().optional() }),
      };
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        body: { name: 'John' },
        params: { id: '123' },
        query: { expand: 'details' },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(request.body).toEqual({ name: 'John' });
      expect(request.params).toEqual({ id: '123' });
      expect(request.query).toEqual({ expand: 'details' });
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should fail on first validation error', async () => {
      const schema = {
        body: z.object({ name: z.string() }),
        params: z.object({ id: z.string().uuid() }),
      };
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        body: { name: 123 },
        params: { id: 'valid-will-not-reach' },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('empty schema', () => {
    it('should pass through when no schema parts are defined', async () => {
      const schema = {};
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        body: { anything: 'goes' },
        params: { id: 'whatever' },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(reply.status).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should include path in validation error details', async () => {
      const schema = {
        body: z.object({
          user: z.object({
            email: z.string().email(),
          }),
        }),
      };
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        body: { user: { email: 'not-an-email' } },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(reply.body.details[0].path).toBe('user.email');
    });

    it('should log validation errors', async () => {
      const schema = {
        body: z.object({ name: z.string() }),
      };
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        body: { name: 123 },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(request.log.warn).toHaveBeenCalled();
    });

    it('should re-throw non-Zod errors', async () => {
      const schema = {
        body: z.object({ name: z.string() }),
      };
      const prehandler = createValidationPrehandler(schema);
      const customError = new Error('Custom error');
      const request = {
        body: null,
        log: { warn: jest.fn() },
      } as unknown as FastifyRequest;

      // Make body getter throw a custom error
      Object.defineProperty(request, 'body', {
        get: () => {
          throw customError;
        },
        set: () => {},
      });

      const reply = createMockReply();

      await expect(prehandler(request, reply as unknown as FastifyReply)).rejects.toThrow(
        'Custom error'
      );
    });
  });

  describe('validation error details format', () => {
    it('should include code in error details', async () => {
      const schema = {
        body: z.object({
          email: z.string().email(),
        }),
      };
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        body: { email: 'invalid' },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(reply.body.details[0]).toHaveProperty('code');
      expect(reply.body.details[0]).toHaveProperty('message');
      expect(reply.body.details[0]).toHaveProperty('path');
    });

    it('should handle multiple validation errors', async () => {
      const schema = {
        body: z.object({
          name: z.string().min(1),
          email: z.string().email(),
          age: z.number().positive(),
        }),
      };
      const prehandler = createValidationPrehandler(schema);
      const request = createMockRequest({
        body: { name: '', email: 'invalid', age: -1 },
      });
      const reply = createMockReply();

      await prehandler(request, reply as unknown as FastifyReply);

      expect(reply.body.details.length).toBe(3);
    });
  });
});
