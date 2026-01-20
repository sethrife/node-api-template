import { buildApp } from '../../src/app';
import { FastifyInstance } from 'fastify';
import { jwtVerify } from 'jose';

const mockJwtVerify = jwtVerify as jest.MockedFunction<typeof jwtVerify>;

describe('jwtAuth middleware', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('authentication', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/profile',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Invalid or missing token');
    });

    it('should return 401 when Authorization header does not start with Bearer', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/profile',
        headers: {
          authorization: 'Basic sometoken',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('should return 401 when JWT verification fails', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('Invalid signature'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/profile',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Invalid or missing token');
    });

    it('should return 401 when token is expired', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('Token expired'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/profile',
        headers: {
          authorization: 'Bearer expired-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should attach user payload to request on successful verification', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          email: 'user@example.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/profile',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user.id).toBe('user-123');
    });
  });

  describe('validateScopes with payload.scope as string', () => {
    it('should grant access when scope string contains required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: 'read write admin',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should deny access when scope string does not contain required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: 'read write',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Forbidden');
      expect(body.message).toBe('Insufficient permissions');
    });

    it('should handle single scope in string', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: 'read',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/data',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('validateScopes with payload.scope as array', () => {
    it('should grant access when scope array contains required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: ['read', 'write', 'admin'],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should deny access when scope array does not contain required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: ['read', 'write'],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should handle single scope in array', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: ['read'],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/data',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('validateScopes with payload.scopes as string', () => {
    it('should grant access when scopes string contains required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scopes: 'read write admin',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should deny access when scopes string does not contain required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scopes: 'read write',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should handle single scope in scopes string', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scopes: 'read',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/data',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('validateScopes with payload.scopes as array', () => {
    it('should grant access when scopes array contains required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scopes: ['read', 'write', 'admin'],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should deny access when scopes array does not contain required scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scopes: ['read', 'write'],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('validateScopes with merged scope and scopes', () => {
    it('should merge scope string and scopes array', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: 'read',
          scopes: ['write', 'admin'],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should merge scope array and scopes string', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: ['read', 'write'],
          scopes: 'admin',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should merge scope string and scopes string', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: 'read write',
          scopes: 'admin',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should merge scope array and scopes array', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: ['read'],
          scopes: ['write', 'admin'],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should require all scopes when multiple are required', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: 'users:write',
          scopes: ['admin'],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/protected/users',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('validateScopes edge cases', () => {
    it('should return 403 when no scopes are present in payload', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 when scope is empty string', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: '',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 when scope is empty array', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: [],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 when scopes is empty string', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scopes: '',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 when scopes is empty array', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scopes: [],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should allow access when no scopes are required', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/profile',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
