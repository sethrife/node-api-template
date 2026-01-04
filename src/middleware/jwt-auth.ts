import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { preHandlerHookHandler } from 'fastify';
import './jwt-types';

// Validate JWKS_URL is configured
if (!process.env.JWKS_URL) {
  throw new Error('JWKS_URL environment variable is required');
}

// Create JWKS fetcher (lazy loads on first use)
const JWKS = createRemoteJWKSet(new URL(process.env.JWKS_URL));

/**
 * Validates if the JWT payload contains the required scopes
 */
function validateScopes(payload: JWTPayload, requiredScopes: string | string[]): boolean {
  // Normalize required scopes to array
  const required = Array.isArray(requiredScopes) ? requiredScopes : [requiredScopes];

  // Extract scopes from JWT payload
  let tokenScopes: string[] = [];

  if (typeof payload.scope === 'string') {
    // Space-separated string format: "read write admin"
    tokenScopes = payload.scope.split(' ');
  } else if (Array.isArray(payload.scopes)) {
    // Array format: ["read", "write", "admin"]
    tokenScopes = payload.scopes;
  } else {
    // No scopes in token
    return false;
  }

  // Check if token has ALL required scopes
  return required.every((scope) => tokenScopes.includes(scope));
}

/**
 * JWT authentication middleware factory
 * @param scopes - Optional scope(s) required for this route
 * @returns Fastify preHandler middleware
 */
export function jwtAuth(scopes?: string | string[]): preHandlerHookHandler {
  return async (request, reply) => {
    // Step 1: Extract token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or missing token',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    // Step 2: Verify JWT signature and expiration using JWKS
    try {
      const { payload } = await jwtVerify(token, JWKS);

      // Step 3: Attach payload to request.user
      request.user = payload;

      // Step 4: Validate scopes (if required)
      if (scopes) {
        const hasRequiredScopes = validateScopes(payload, scopes);
        if (!hasRequiredScopes) {
          return reply.code(403).send({
            error: 'Forbidden',
            message: 'Insufficient permissions',
          });
        }
      }

      // Step 5: Continue to route handler (no return = proceed)
    } catch (error) {
      // Invalid signature, expired, or malformed token
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or missing token',
      });
    }
  };
}
