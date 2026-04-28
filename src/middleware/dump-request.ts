import { preHandlerHookHandler } from 'fastify';

export function dumpRequest(): preHandlerHookHandler {
  return async (request, _reply) => {
    request.log.debug({
      method: request.method,
      url: request.url,
      headers: request.headers,
      query: request.query,
      body: request.body,
    }, 'dump-request');
  };
}
