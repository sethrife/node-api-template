# HTTP Route Decorator Middleware Support

## Overview

Add optional middleware support to HTTP method route decorators (GET, POST, PUT, DELETE, PATCH) using Fastify's preHandler hooks.

## Goals

- Enable route-specific middleware through decorator parameters
- Maintain backward compatibility with existing routes
- Provide type-safe middleware using Fastify's native types
- Keep the API simple and focused on middleware only

## API Design

### Syntax

```typescript
// No middleware - existing behavior (backward compatible)
@Get('/public')
async getPublic() { ... }

// Single middleware
@Get('/users', authMiddleware)
async getUsers() { ... }

// Multiple middleware (array)
@Post('/admin', [authMiddleware, adminMiddleware])
async adminAction() { ... }
```

### Design Decisions

1. **Second parameter:** Middleware passed as optional second argument to decorators
2. **Flexible input:** Accepts both single function or array of functions
3. **Backward compatible:** Existing routes without middleware continue working
4. **Fastify native:** Uses `preHandler` hooks under the hood
5. **Type safe:** Middleware typed as Fastify's `preHandlerHookHandler`

### Scope

- Update all 5 HTTP method decorators: GET, POST, PUT, DELETE, PATCH
- Note: PATCH decorator currently missing from `route.decorator.ts` - will add it
- Store middleware in route metadata
- Update `registerControllers.ts` to pass middleware to Fastify

## Implementation Details

### 1. RouteDefinition Interface Update

**Current:**
```typescript
export interface RouteDefinition {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  methodName: string;
}
```

**New:**
```typescript
import { preHandlerHookHandler } from 'fastify';

export interface RouteDefinition {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  methodName: string;
  middleware?: preHandlerHookHandler | preHandlerHookHandler[];
}
```

### 2. Decorator Signature Changes

**Current:**
```typescript
export function Get(path: string = ''): MethodDecorator { ... }
```

**New:**
```typescript
export function Get(
  path: string = '',
  middleware?: preHandlerHookHandler | preHandlerHookHandler[]
): MethodDecorator { ... }
```

All HTTP method decorators (GET, POST, PUT, DELETE, PATCH) will follow this pattern.

### 3. Route Registration Changes

**Current registration:**
```typescript
switch (method) {
  case 'GET':
    app.get(fullPath, handler);
    break;
  // etc...
}
```

**New registration with middleware:**
```typescript
const routes: RouteDefinition[] = Reflect.getMetadata(ROUTE_METADATA_KEY, controller);

routes.forEach((route) => {
  const fullPath = `${basePath}${route.path}`;
  const handler = (instance[route.methodName] as Function).bind(instance);

  // Normalize middleware to array
  const preHandler = route.middleware
    ? Array.isArray(route.middleware)
      ? route.middleware
      : [route.middleware]
    : undefined;

  // Register with options if middleware exists
  const routeOptions = preHandler ? { preHandler } : {};

  switch (route.method) {
    case 'GET':
      app.get(fullPath, routeOptions, handler);
      break;
    case 'POST':
      app.post(fullPath, routeOptions, handler);
      break;
    // etc...
  }
});
```

**Key points:**
- Normalize middleware (single or array) to array format
- Only pass options object if middleware exists
- Fastify's signature: `app.method(path, [options], handler)`

## TypeScript Types & Usage

### Middleware Type Definition

```typescript
import { preHandlerHookHandler } from 'fastify';

// Example middleware with full type safety
const authMiddleware: preHandlerHookHandler = async (request, reply) => {
  const token = request.headers.authorization;
  if (!token) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  // Continue to next handler
};

const loggingMiddleware: preHandlerHookHandler = async (request, reply) => {
  console.log(`${request.method} ${request.url}`);
};
```

### Complete Usage Example

```typescript
import { Controller, Get, Post, Delete } from './decorators/route.decorator';
import { FastifyRequest, FastifyReply } from 'fastify';

@Controller('/api/users')
export class UserController {
  // No middleware
  @Get('/public')
  async getPublic(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ message: 'Public endpoint' });
  }

  // Single middleware
  @Get('/', authMiddleware)
  async getUsers(request: FastifyRequest, reply: FastifyReply) {
    return reply.send(this.users);
  }

  // Multiple middleware (runs in order: auth, then logging)
  @Post('/', [authMiddleware, loggingMiddleware])
  async createUser(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ created: true });
  }

  // Multiple middleware
  @Delete('/:id', [authMiddleware, adminMiddleware, loggingMiddleware])
  async deleteUser(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ deleted: true });
  }
}
```

## Testing Approach

### Decorator Metadata Tests

- Verify middleware is stored correctly in route metadata
- Test single middleware function
- Test array of middleware functions
- Test routes without middleware (backward compatibility)
- Verify all HTTP methods (GET, POST, PUT, DELETE, PATCH)

### Integration Tests

- Create test controller with middleware
- Register controller with Fastify app
- Make HTTP requests and verify middleware executes
- Verify middleware execution order (array order matters)
- Verify middleware can block requests (return early)

## Edge Cases

- **Empty array:** `@Get('/path', [])` - should work but have no effect
- **Middleware throws error:** Fastify's error handling should catch it
- **Middleware doesn't call next:** Reply sent early, handler doesn't run (expected behavior)
- **Mixed middleware types:** Some routes with middleware, some without - both should work
- **Type validation:** TypeScript should prevent passing non-function values

## Files to Modify

1. `src/decorators/route.decorator.ts` - Add middleware parameter to all decorators, update RouteDefinition interface
2. `src/lib/registerControllers.ts` - Update registration logic to handle middleware
3. Add PATCH decorator (currently missing)

## Non-Goals

- Other Fastify route options (schema, config, etc.) - keeping focused on middleware only
- Global middleware - use Fastify's native `app.addHook()` for that
- Middleware composition utilities - developers can compose middleware themselves
