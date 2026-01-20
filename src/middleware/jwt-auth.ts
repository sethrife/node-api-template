import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { preHandlerHookHandler } from 'fastify';
import { config } from '../config/index.js';

// Lazy initialization of JWKS fetcher
let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!JWKS) {
    if (!config.jwt.jwksUrl) {
      throw new Error('JWKS_URL environment variable is required for JWT authentication');
    }
    JWKS = createRemoteJWKSet(new URL(config.jwt.jwksUrl));
  }
  return JWKS;
}

/**
 * Validates if the JWT payload contains the required scopes
 */
function validateScopes(payload: JWTPayload, requiredScopes: string | string[]): boolean {
  // Normalize required scopes to array
  const required = Array.isArray(requiredScopes) ? requiredScopes : [requiredScopes];

  // Extract scopes from JWT payload (check both 'scope' and 'scopes' properties)
  let tokenScopes: string[] = [];

  // Check payload.scope (string or array)
  if (typeof payload.scope === 'string') {
    tokenScopes = payload.scope.split(' ');
  } else if (Array.isArray(payload.scope)) {
    tokenScopes = payload.scope;
  }

  // Check payload.scopes (string or array) and merge
  if (typeof payload.scopes === 'string') {
    tokenScopes = [...tokenScopes, ...payload.scopes.split(' ')];
  } else if (Array.isArray(payload.scopes)) {
    tokenScopes = [...tokenScopes, ...payload.scopes];
  }

  // No scopes found in token
  if (tokenScopes.length === 0) {
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
      const { payload } = await jwtVerify(token, getJWKS());

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
