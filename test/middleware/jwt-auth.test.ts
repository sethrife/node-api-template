import { jwtAuth } from '../../src/middleware/jwt-auth.js';
import { jwtVerify } from 'jose';
import { FastifyRequest, FastifyReply } from 'fastify';

const mockJwtVerify = jwtVerify as jest.MockedFunction<typeof jwtVerify>;

function createMockRequest(authHeader?: string): FastifyRequest {
  return {
    headers: {
      authorization: authHeader,
    },
    user: undefined,
  } as unknown as FastifyRequest;
}

interface MockReply {
  statusCode: number;
  body: any;
  code: jest.Mock;
  send: jest.Mock;
}

function createMockReply(): MockReply {
  const reply: MockReply = {
    statusCode: 200,
    body: null,
    code: jest.fn(),
    send: jest.fn(),
  };
  reply.code.mockImplementation((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.send.mockImplementation((body: any) => {
    reply.body = body;
    return reply;
  });
  return reply;
}

async function callMiddleware(
  middleware: ReturnType<typeof jwtAuth>,
  request: FastifyRequest,
  reply: MockReply
) {
  return middleware.call({} as any, request, reply as unknown as FastifyReply, jest.fn());
}

describe('jwtAuth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authentication', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const middleware = jwtAuth();
      const request = createMockRequest(undefined);
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid or missing token',
      });
    });

    it('should return 401 when Authorization header does not start with Bearer', async () => {
      const middleware = jwtAuth();
      const request = createMockRequest('Basic sometoken');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid or missing token',
      });
    });

    it('should return 401 when JWT verification fails', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('Invalid signature'));

      const middleware = jwtAuth();
      const request = createMockRequest('Bearer invalid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid or missing token',
      });
    });

    it('should return 401 when token is expired', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('Token expired'));

      const middleware = jwtAuth();
      const request = createMockRequest('Bearer expired-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('should attach user payload to request on successful verification', async () => {
      const payload = {
        sub: 'user-123',
        email: 'user@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      mockJwtVerify.mockResolvedValueOnce({
        payload,
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth();
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(request.user).toEqual(payload);
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should not call reply methods on successful authentication without scopes', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: { sub: 'user-123' },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth();
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });
  });

  describe('validateScopes with payload.scope as string', () => {
    it('should grant access when scope string contains required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: 'read write admin',
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should deny access when scope string does not contain required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: 'read write',
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    });

    it('should handle single scope in string', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: 'read',
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('read');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  describe('validateScopes with payload.scope as array', () => {
    it('should grant access when scope array contains required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: ['read', 'write', 'admin'],
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should deny access when scope array does not contain required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: ['read', 'write'],
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });

    it('should handle single scope in array', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: ['read'],
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('read');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  describe('validateScopes with payload.scopes as string', () => {
    it('should grant access when scopes string contains required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scopes: 'read write admin',
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should deny access when scopes string does not contain required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scopes: 'read write',
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });

    it('should handle single scope in scopes string', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scopes: 'read',
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('read');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  describe('validateScopes with payload.scopes as array', () => {
    it('should grant access when scopes array contains required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scopes: ['read', 'write', 'admin'],
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should deny access when scopes array does not contain required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scopes: ['read', 'write'],
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });
  });

  describe('validateScopes with merged scope and scopes', () => {
    it('should merge scope string and scopes array', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: 'read',
          scopes: ['write', 'admin'],
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should merge scope array and scopes string', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: ['read', 'write'],
          scopes: 'admin',
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should merge scope string and scopes string', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: 'read write',
          scopes: 'admin',
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should merge scope array and scopes array', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: ['read'],
          scopes: ['write', 'admin'],
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should require all scopes when multiple are required', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: 'users:write',
          scopes: ['admin'],
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth(['users:write', 'admin']);
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should deny when missing one of multiple required scopes', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: 'users:write',
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth(['users:write', 'admin']);
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });
  });

  describe('validateScopes edge cases', () => {
    it('should return 403 when no scopes are present in payload', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });

    it('should return 403 when scope is empty string', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: '',
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });

    it('should return 403 when scope is empty array', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: [],
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });

    it('should return 403 when scopes is empty string', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scopes: '',
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });

    it('should return 403 when scopes is empty array', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scopes: [],
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth('admin');
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });

    it('should allow access when no scopes are required', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth();
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should handle required scopes as array', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: 'read write admin',
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const middleware = jwtAuth(['read', 'admin']);
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await callMiddleware(middleware, request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });
  });
});
