import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';

describe('HealthController', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return health status with Redis and MSSQL checks', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('status', 'ok');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('services');
      expect(body.services).toHaveProperty('redis');
      expect(body.services.redis).toHaveProperty('status', 'ok');
      expect(body.services).toHaveProperty('mssql');
      expect(body.services.mssql).toHaveProperty('status', 'ok');
    });

    it('should return a valid ISO timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      const timestamp = new Date(body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.toISOString()).toBe(body.timestamp);
    });

    it('should include Redis status in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(body.services.redis.status).toBe('ok');
      expect(body.services.redis.error).toBeUndefined();
    });

    it('should include MSSQL status in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(body.services.mssql.status).toBe('ok');
      expect(body.services.mssql.error).toBeUndefined();
    });

    it('should return degraded status when Redis fails', async () => {
      const redisSpy = jest.spyOn(app.redis, 'ping').mockRejectedValueOnce(new Error('Redis connection refused'));

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.status).toBe('degraded');
      expect(body.services.redis.status).toBe('error');
      expect(body.services.redis.error).toBe('Redis connection refused');
      expect(body.services.mssql.status).toBe('ok');

      redisSpy.mockRestore();
    });

    it('should return degraded status when MSSQL fails', async () => {
      const mssqlSpy = jest.spyOn(app.mssql, 'ping').mockRejectedValueOnce(new Error('MSSQL connection timeout'));

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.status).toBe('degraded');
      expect(body.services.mssql.status).toBe('error');
      expect(body.services.mssql.error).toBe('MSSQL connection timeout');
      expect(body.services.redis.status).toBe('ok');

      mssqlSpy.mockRestore();
    });

    it('should return degraded status when both Redis and MSSQL fail', async () => {
      const redisSpy = jest.spyOn(app.redis, 'ping').mockRejectedValueOnce(new Error('Redis unavailable'));
      const mssqlSpy = jest.spyOn(app.mssql, 'ping').mockRejectedValueOnce(new Error('MSSQL unavailable'));

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.status).toBe('degraded');
      expect(body.services.redis.status).toBe('error');
      expect(body.services.redis.error).toBe('Redis unavailable');
      expect(body.services.mssql.status).toBe('error');
      expect(body.services.mssql.error).toBe('MSSQL unavailable');

      redisSpy.mockRestore();
      mssqlSpy.mockRestore();
    });

    it('should return error status when Redis returns unexpected value', async () => {
      const redisSpy = jest.spyOn(app.redis, 'ping').mockResolvedValueOnce('NOT_PONG' as any);

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.status).toBe('degraded');
      expect(body.services.redis.status).toBe('error');

      redisSpy.mockRestore();
    });

    it('should return error status when MSSQL returns false', async () => {
      const mssqlSpy = jest.spyOn(app.mssql, 'ping').mockResolvedValueOnce(false);

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.status).toBe('degraded');
      expect(body.services.mssql.status).toBe('error');

      mssqlSpy.mockRestore();
    });
  });
});
