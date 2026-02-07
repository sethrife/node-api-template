import type { HttpSignatureInfo } from './types.js';

declare module 'fastify' {
  interface FastifyRequest {
    httpSignature?: HttpSignatureInfo;
  }
}
