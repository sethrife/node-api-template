import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';
import { jwtVerify } from 'jose';

// Get the mocked jwtVerify function
const mockJwtVerify = jwtVerify as jest.MockedFunction<typeof jwtVerify>;

describe('ProtectedController', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/protected/public', () => {
    it('should return public data without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/public',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('This is a public endpoint');
      expect(body.authenticated).toBe(false);
    });

    it('should not require Authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/public',
        headers: {},
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/protected/profile', () => {
    it('should return profile data with valid JWT', async () => {
      // Mock successful JWT verification
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
      expect(body.message).toBe('Profile data');
      expect(body.user.id).toBe('user-123');
      expect(body.user.email).toBe('user@example.com');
    });

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

    it('should return 401 when Authorization header is malformed', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/profile',
        headers: {
          authorization: 'InvalidFormat',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('should return 401 when JWT verification fails', async () => {
      // Mock failed JWT verification
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
  });

  describe('GET /api/protected/admin', () => {
    it('should return admin data when user has admin scope', async () => {
      // Mock JWT with admin scope
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'admin-user-123',
          scope: 'read write admin',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-admin-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Admin access granted');
      expect(body.userId).toBe('admin-user-123');
    });

    it('should return 403 when user lacks admin scope', async () => {
      // Mock JWT without admin scope
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
          authorization: 'Bearer valid-token-no-admin',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Forbidden');
      expect(body.message).toBe('Insufficient permissions');
    });

    it('should work with scopes as array format', async () => {
      // Mock JWT with scopes as array
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'admin-user-456',
          scopes: ['read', 'write', 'admin'],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
        headers: {
          authorization: 'Bearer valid-admin-token',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 401 when token is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/admin',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/protected/users', () => {
    it('should create user when user has both required scopes', async () => {
      // Mock JWT with both users:write and admin scopes
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'admin-user-123',
          scopes: ['users:write', 'admin', 'read'],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/protected/users',
        headers: {
          authorization: 'Bearer valid-token-with-all-scopes',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('User created');
      expect(body.createdBy).toBe('admin-user-123');
    });

    it('should return 403 when user has only one of the required scopes', async () => {
      // Mock JWT with only admin scope, missing users:write
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'admin-user-123',
          scopes: ['admin', 'read'],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/protected/users',
        headers: {
          authorization: 'Bearer token-missing-users-write',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Forbidden');
    });

    it('should return 403 when user has no scopes', async () => {
      // Mock JWT with no scopes
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/protected/users',
        headers: {
          authorization: 'Bearer token-no-scopes',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should work with space-separated scope string', async () => {
      // Mock JWT with space-separated scopes
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'admin-user-789',
          scope: 'users:write admin read',
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

  describe('GET /api/protected/data', () => {
    it('should return data when user has read scope', async () => {
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
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Here is your data');
      expect(body.data).toEqual([1, 2, 3]);
    });

    it('should return 403 when user lacks read scope', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          scope: 'write admin',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { alg: 'RS256' },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected/data',
        headers: {
          authorization: 'Bearer token-no-read',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
