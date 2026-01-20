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
  });
});
