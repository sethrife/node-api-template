import { JWTPayload } from 'jose';

// Extend FastifyRequest to include user property
declare module 'fastify' {
  interface FastifyRequest {
    user: JWTPayload;
  }
}

// JWTPayload from jose includes standard JWT claims:
// - sub?: string (subject/user ID)
// - exp?: number (expiration timestamp)
// - iat?: number (issued at timestamp)
// - nbf?: number (not before timestamp)
// - iss?: string (issuer)
// - aud?: string | string[] (audience)
// - scope?: string (space-separated scopes)
// - scopes?: string[] (array of scopes)
// - [key: string]: any (custom claims)
