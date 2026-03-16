import Fastify, { FastifyInstance } from 'fastify';
import formbodyPlugin from '../../src/plugins/formbody.plugin.js';

describe('formbodyPlugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(formbodyPlugin);

    app.post('/test', async (request, reply) => {
      return reply.send(request.body);
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('parses flat urlencoded body into an object', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'name=John&email=john%40example.com',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      name: 'John',
      email: 'john@example.com',
    });
  });

  it("parses numeric strings as strings (coercion is the schema author's job)", async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'age=30',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ age: '30' });
  });

  it('still parses application/json bodies normally', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'Jane' }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ name: 'Jane' });
  });

  it('works with Zod z.coerce.number() on a urlencoded numeric field', async () => {
    const app2 = Fastify({ logger: false });
    await app2.register(formbodyPlugin);

    const { z } = await import('zod');
    const schema = z.object({ age: z.coerce.number() });

    app2.post('/coerce', async (request, reply) => {
      const parsed = schema.parse(request.body);
      return reply.send(parsed);
    });

    await app2.ready();

    const response = await app2.inject({
      method: 'POST',
      url: '/coerce',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'age=42',
    });

    try {
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ age: 42 });
    } finally {
      await app2.close();
    }
  });
});
