import { preHandlerHookHandler } from 'fastify';

/**
 * Example middleware for populating request context with computed/derived data
 * using @fastify/request-context
 *
 * This middleware demonstrates how to:
 * 1. Extract data from request.user (JWT payload)
 * 2. Derive data from request headers
 * 3. Compute data from multiple sources
 * 4. Store everything in request context for downstream use
 *
 * Usage in controller:
 * @Get('/')
 * async myHandler(request: FastifyRequest, reply: FastifyReply) {
 *   const userId = request.requestContext.get('userId');
 *   const tenantId = request.requestContext.get('tenantId');
 *   const permissions = request.requestContext.get('permissions');
 *   // Use the computed context data
 * }
 */
export const populateContext: preHandlerHookHandler = async (request, reply) => {
  // Example 1: Extract user ID from JWT
  if (request.user?.sub) {
    request.requestContext.set('userId', request.user.sub);
  }

  // Example 2: Derive tenant ID from header or JWT
  const tenantHeader = request.headers['x-tenant-id'];
  const tenantFromJWT = request.user?.tenant;
  const tenantId =
    (tenantHeader as string) ||
    (typeof tenantFromJWT === 'string' ? tenantFromJWT : undefined) ||
    'default';
  request.requestContext.set('tenantId', tenantId);

  // Example 3: Compute permissions from user scopes
  if (request.user?.scopes) {
    const scopes = request.user.scopes;
    const permissions = Array.isArray(scopes) ? scopes : typeof scopes === 'string' ? [scopes] : [];
    request.requestContext.set('permissions', permissions);
  }

  // Example 4: Add more computed properties as needed
  // const role = computeRole(request.user);
  // request.requestContext.set('role', role);
  //
  // const orgId = await fetchOrganization(request.user?.sub);
  // request.requestContext.set('organizationId', orgId);
};

/**
 * Example middleware for user-specific context
 */
export const userContextMiddleware: preHandlerHookHandler = async (request, reply) => {
  // Only populate user-specific context if authenticated
  if (!request.user) {
    return; // Skip if no user
  }

  // Extract user ID
  if (request.user.sub) {
    request.requestContext.set('userId', request.user.sub);
  }

  // Compute permissions from scopes
  if (request.user.scopes) {
    const scopes = Array.isArray(request.user.scopes) ? request.user.scopes : [request.user.scopes];

    request.requestContext.set('permissions', scopes);
  }
};

/**
 * Example middleware for tenant/organization context
 */
export const tenantContextMiddleware: preHandlerHookHandler = async (request, reply) => {
  // Get tenant ID from header or JWT
  const tenantId = request.headers['x-tenant-id'] || request.user?.tenant;

  if (tenantId) {
    request.requestContext.set('tenantId', tenantId as string);

    // Optionally: Fetch and cache tenant data from Redis
    // const tenantData = await request.server.redis.get(`tenant:${tenantId}`);
    // if (tenantData) {
    //   request.requestContext.set('tenant', JSON.parse(tenantData));
    // }
  }
};
