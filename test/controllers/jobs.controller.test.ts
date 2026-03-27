import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';

describe('JobsController', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/jobs', () => {
    it('returns 200 with list of registered jobs', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/jobs' });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0]).toMatchObject({
        name: expect.any(String),
        schedule: expect.any(String),
        running: expect.any(Boolean),
      });
    });

    it('includes the example-hourly job', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/jobs' });
      const body = JSON.parse(response.body);

      expect(body.some((j: any) => j.name === 'example-hourly')).toBe(true);
    });
  });

  describe('POST /api/jobs/:name/run', () => {
    it('returns 202 with alreadyRunning: false when job is triggered', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/jobs/example-hourly/run',
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({ name: 'example-hourly', alreadyRunning: false });
    });

    it('returns 202 with alreadyRunning: true when job is already running', async () => {
      jest.spyOn(app.scheduler, 'run').mockReturnValueOnce({ alreadyRunning: true });

      const response = await app.inject({
        method: 'POST',
        url: '/api/jobs/example-hourly/run',
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({ name: 'example-hourly', alreadyRunning: true });
    });

    it('returns 404 when job name does not exist', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/jobs/does-not-exist/run',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({ error: 'Job not found', name: 'does-not-exist' });
    });
  });
});
