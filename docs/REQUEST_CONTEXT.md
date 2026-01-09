# Request Context Guide

## Overview

This application uses **@fastify/request-context** to store request-scoped data that can be accessed throughout the request lifecycle. This is useful for storing computed/derived data from middleware that needs to be accessed in downstream hooks and route handlers.

## How It Works

The `@fastify/request-context` plugin provides a request-scoped storage mechanism that:
- Automatically creates a context for each request
- Is accessible via `request.requestContext`
- Provides `get()` and `set()` methods for storing data
- Is automatically cleaned up after the request completes

## Setup

The plugin is registered in `src/app.ts`:

```typescript
import requestContext from '@fastify/request-context';

await app.register(requestContext);
```

## TypeScript Types

Context data types are defined in `src/types/fastify.d.ts`:

```typescript
declare module '@fastify/request-context' {
  interface RequestContextData {
    userId?: string;
    tenantId?: string;
    permissions?: string[];
    // Add your custom properties here
  }
}
```

## Usage

### Setting Context Data

Use `request.requestContext.set()` in middleware to store computed data:

```typescript
import { preHandlerHookHandler } from 'fastify';

export const populateContext: preHandlerHookHandler = async (request, reply) => {
  // Extract user ID from JWT
  if (request.user?.sub) {
    request.requestContext.set('userId', request.user.sub);
  }

  // Derive tenant ID from header
  const tenantId = request.headers['x-tenant-id'];
  if (tenantId) {
    request.requestContext.set('tenantId', tenantId as string);
  }

  // Compute permissions from scopes
  if (request.user?.scopes) {
    const permissions = Array.isArray(request.user.scopes)
      ? request.user.scopes
      : [request.user.scopes];
    request.requestContext.set('permissions', permissions);
  }
};
```

### Getting Context Data

Access stored data using `request.requestContext.get()`:

```typescript
@Get('/profile')
async getProfile(request: FastifyRequest, reply: FastifyReply) {
  // Get data from context
  const userId = request.requestContext.get('userId');
  const tenantId = request.requestContext.get('tenantId');
  const permissions = request.requestContext.get('permissions');

  // Use the computed data
  const profile = await this.fetchUserProfile(userId, tenantId);
  return reply.send(profile);
}
```

### Using Middleware in Routes

Apply context middleware to specific routes:

```typescript
import { populateContext } from '../middleware/populate-context.js';

@Get('/data')
async getData(request: FastifyRequest, reply: FastifyReply) {
  // First, apply populateContext middleware in your route decorator system
  // Then access the context data:
  const userId = request.requestContext.get('userId');
  const tenantId = request.requestContext.get('tenantId');

  return this.fetchData(userId, tenantId);
}
```

## Example Middleware

Three example middleware functions are provided in `src/middleware/populate-context.ts`:

### 1. General Context Population

```typescript
export const populateContext: preHandlerHookHandler = async (request, reply) => {
  // Populates userId, tenantId, and permissions
  // Use for general-purpose context setup
};
```

### 2. User Context

```typescript
export const userContextMiddleware: preHandlerHookHandler = async (request, reply) => {
  // Only populates user-specific context (userId, permissions)
  // Skips if no user is authenticated
};
```

### 3. Tenant Context

```typescript
export const tenantContextMiddleware: preHandlerHookHandler = async (request, reply) => {
  // Populates tenant-specific context
  // Optionally fetches tenant data from Redis
};
```

## Common Patterns

### Checking if Data Exists

```typescript
const userId = request.requestContext.get('userId');
if (!userId) {
  return reply.status(401).send({ error: 'User not authenticated' });
}
```

### Storing Computed Data from Database

```typescript
export const enrichUserContext: preHandlerHookHandler = async (request, reply) => {
  const userId = request.requestContext.get('userId');

  if (userId) {
    // Fetch additional user data
    const userData = await request.server.redis.get(`user:${userId}`);

    if (userData) {
      const parsed = JSON.parse(userData);
      request.requestContext.set('userRole', parsed.role);
      request.requestContext.set('userOrganization', parsed.organizationId);
    }
  }
};
```

### Logging with Context

```typescript
export const logRequest: preHandlerHookHandler = async (request, reply) => {
  const userId = request.requestContext.get('userId');
  const tenantId = request.requestContext.get('tenantId');

  request.log.info({
    userId,
    tenantId,
    method: request.method,
    url: request.url
  }, 'Processing request');
};
```

## Adding Custom Context Properties

1. **Add TypeScript type** in `src/types/fastify.d.ts`:

```typescript
declare module '@fastify/request-context' {
  interface RequestContextData {
    userId?: string;
    tenantId?: string;
    permissions?: string[];
    // Add your new property
    organizationId?: string;
    userRole?: string;
    sessionId?: string;
  }
}
```

2. **Set the data in middleware**:

```typescript
export const customContextMiddleware: preHandlerHookHandler = async (request, reply) => {
  const orgId = await fetchOrganizationId(request.user?.sub);
  request.requestContext.set('organizationId', orgId);

  const role = computeUserRole(request.user);
  request.requestContext.set('userRole', role);
};
```

3. **Access in route handlers**:

```typescript
@Get('/organization-data')
async getData(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.requestContext.get('organizationId');
  const role = request.requestContext.get('userRole');

  return this.fetchOrganizationData(orgId, role);
}
```

## Benefits

✅ **Request-Scoped**: Data is isolated per request, no cross-contamination
✅ **Type-Safe**: Full TypeScript support with autocomplete
✅ **Automatic Cleanup**: Context is cleared after request completes
✅ **Official Plugin**: Maintained by Fastify core team
✅ **Performance**: Minimal overhead, uses AsyncLocalStorage

## Best Practices

### 1. Populate Early in Request Lifecycle

Register context middleware early so downstream middleware and handlers can access the data:

```typescript
// In app.ts
await app.register(requestContext);  // Early registration

// In routes - context is already available
```

### 2. Check for Existence Before Use

Always check if context data exists before using it:

```typescript
const userId = request.requestContext.get('userId');
if (!userId) {
  // Handle missing data
}
```

### 3. Use Descriptive Property Names

```typescript
// Good
request.requestContext.set('userOrganizationId', orgId);
request.requestContext.set('computedPermissions', permissions);

// Avoid
request.requestContext.set('data', orgId);
request.requestContext.set('x', permissions);
```

### 4. Don't Store Large Objects

Context is meant for lightweight computed data, not large datasets:

```typescript
// Good
request.requestContext.set('userId', '123');
request.requestContext.set('permissions', ['read', 'write']);

// Avoid
const allUserData = await fetchEntireUserDatabase();
request.requestContext.set('userData', allUserData); // Too large!
```

### 5. Use for Derived Data, Not Raw Requests

Store computed/transformed data, not raw request data:

```typescript
// Good - derived/computed
request.requestContext.set('userId', request.user.sub);
request.requestContext.set('isAdmin', checkAdmin(request.user.scopes));

// Avoid - raw request data (already on request object)
request.requestContext.set('body', request.body);
request.requestContext.set('headers', request.headers);
```

## Debugging

### Check What's in Context

```typescript
// Log all context data
const allContext = request.requestContext.get();
request.log.debug({ context: allContext }, 'Current request context');
```

### Common Issues

**Issue**: Context data is undefined
- **Solution**: Ensure middleware that sets the data runs before you try to access it

**Issue**: TypeScript errors when accessing context
- **Solution**: Make sure you've extended `RequestContextData` interface in `src/types/fastify.d.ts`

**Issue**: Data persists across requests
- **Solution**: This shouldn't happen with @fastify/request-context, verify you're not using global variables

## Resources

- [@fastify/request-context Documentation](https://github.com/fastify/fastify-request-context)
- [Fastify Hooks Documentation](https://fastify.dev/docs/latest/Reference/Hooks/)
- [AsyncLocalStorage (Node.js)](https://nodejs.org/api/async_context.html#class-asynclocalstorage)
