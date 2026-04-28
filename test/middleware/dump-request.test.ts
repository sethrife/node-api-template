import { dumpRequest } from '../../src/middleware/dump-request.js';
import type { FastifyReply } from 'fastify';

function createMockRequest(overrides: Record<string, any> = {}) {
  return {
    method: 'GET',
    url: '/test',
    headers: { host: 'localhost' },
    query: {},
    body: undefined,
    log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    ...overrides,
  } as any;
}

function createMockReply() {
  const reply = { send: jest.fn(), code: jest.fn() };
  reply.code.mockReturnValue(reply);
  return reply as unknown as FastifyReply;
}

describe('dumpRequest()', () => {
  it('logs method, url, headers, query, and body via request.log.debug', async () => {
    const request = createMockRequest({
      method: 'POST',
      url: '/api/data',
      headers: { 'content-type': 'application/json', authorization: 'Bearer token123' },
      query: { foo: 'bar' },
      body: { hello: 'world' },
    });
    const reply = createMockReply();

    await dumpRequest().call({} as any, request, reply, jest.fn());

    expect(request.log.debug).toHaveBeenCalledWith(
      {
        method: 'POST',
        url: '/api/data',
        headers: { 'content-type': 'application/json', authorization: 'Bearer token123' },
        query: { foo: 'bar' },
        body: { hello: 'world' },
      },
      'dump-request'
    );
  });

  it('does not call reply.send or reply.code (passes through)', async () => {
    const request = createMockRequest();
    const reply = createMockReply();

    await dumpRequest().call({} as any, request, reply, jest.fn());

    expect(reply.send).not.toHaveBeenCalled();
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('logs parsed body when a POST request has a JSON body', async () => {
    const request = createMockRequest({
      method: 'POST',
      url: '/api/users',
      body: { name: 'Alice', email: 'alice@example.com' },
    });
    const reply = createMockReply();

    await dumpRequest().call({} as any, request, reply, jest.fn());

    const logged = request.log.debug.mock.calls[0][0];
    expect(logged.body).toEqual({ name: 'Alice', email: 'alice@example.com' });
  });

  it('logs body as undefined for requests with no body (GET)', async () => {
    const request = createMockRequest({ method: 'GET', url: '/api/users', body: undefined });
    const reply = createMockReply();

    await dumpRequest().call({} as any, request, reply, jest.fn());

    const logged = request.log.debug.mock.calls[0][0];
    expect(logged.body).toBeUndefined();
  });
});
