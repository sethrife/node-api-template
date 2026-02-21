# Cache Usage Guide

The application includes a general-purpose in-memory cache with LRU eviction and per-entry TTL support. Available both as a standalone utility and via Fastify plugin.

## Quick Start

### Via Fastify Plugin

```typescript
// In a controller or route handler
const userCache = request.server.cache.getCache<User>('users');

// Set with default TTL
userCache.set('user:123', user);

// Set with custom TTL (30 seconds)
userCache.set('user:456', user, { ttlMs: 30000 });

// Get from cache
const cached = userCache.get('user:123');
```

### Standalone Utility

```typescript
import { createCache } from '../utils/cache.js';

const cache = createCache<User>({
  maxEntries: 100,
  defaultTtlMs: 60000, // 1 minute
});

cache.set('user:123', user);
const cached = cache.get('user:123');
```

## Cache Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxEntries` | number | Infinity | Maximum entries before LRU eviction |
| `defaultTtlMs` | number | null | Default TTL in milliseconds |

## API Reference

### Basic Operations

```typescript
const cache = createCache<string>({ maxEntries: 100 });

// Set a value
cache.set('key', 'value');
cache.set('key', 'value', { ttlMs: 5000 }); // With custom TTL

// Get a value (returns undefined if missing or expired)
const value = cache.get('key');

// Check if key exists and is not expired
if (cache.has('key')) {
  // ...
}

// Delete a key
cache.delete('key');

// Clear all entries
cache.clear();

// Get current size
console.log(cache.size);

// Get all keys
const keys = cache.keys();
```

### Cache-Aside Pattern

Use `getOrSet()` to fetch from cache or compute on miss:

```typescript
// Sync factory
const user = await cache.getOrSet('user:123', () => {
  return { id: '123', name: 'Alice' };
});

// Async factory (common pattern)
const user = await cache.getOrSet('user:123', async () => {
  return await fetchUserFromDatabase('123');
});

// With custom TTL
const user = await cache.getOrSet(
  'user:123',
  () => fetchUserFromDatabase('123'),
  { ttlMs: 30000 }
);
```

### Maintenance Operations

```typescript
// Remove all expired entries
const removedCount = cache.prune();

// Get cache statistics
const stats = cache.stats();
// {
//   size: 42,
//   maxEntries: 100,
//   expiredCount: 3,
//   oldestEntryAge: 45000,  // ms
//   newestEntryAge: 1000    // ms
// }
```

## CacheService (Plugin API)

The Fastify plugin provides a `CacheService` that manages multiple named caches:

```typescript
// Get or create a named cache
const users = request.server.cache.getCache<User>('users');
const sessions = request.server.cache.getCache<Session>('sessions');

// Check if a named cache exists
if (request.server.cache.hasCache('users')) {
  // ...
}

// Delete a named cache
request.server.cache.deleteCache('users');

// Clear all caches
request.server.cache.clearAll();

// Get all cache names
const names = request.server.cache.getCacheNames();

// Prune expired entries from all caches
const totalRemoved = request.server.cache.pruneAll();
```

### Per-Cache Options

Each named cache can have its own configuration:

```typescript
// High-traffic cache with short TTL
const hotData = request.server.cache.getCache<Data>('hot', {
  maxEntries: 1000,
  defaultTtlMs: 10000, // 10 seconds
});

// Lower-traffic cache with longer TTL
const refData = request.server.cache.getCache<RefData>('reference', {
  maxEntries: 100,
  defaultTtlMs: 300000, // 5 minutes
});
```

## Example: Controller with Caching

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { Controller, Get } from '../decorators/route.decorator.js';

interface User {
  id: string;
  name: string;
  email: string;
}

@Controller('/api/users')
export class UserController {
  @Get('/:id')
  async getUser(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const { id } = request.params;
    const userCache = request.server.cache.getCache<User>('users');

    // Try cache first, fetch on miss
    const user = await userCache.getOrSet(`user:${id}`, async () => {
      request.log.info({ userId: id }, 'Cache miss, fetching from database');

      const result = await request.server.mssql.query<User>(
        'SELECT id, name, email FROM users WHERE id = @id',
        { id }
      );

      if (!result.recordset[0]) {
        throw new Error('User not found');
      }

      return result.recordset[0];
    }, { ttlMs: 60000 }); // Cache for 1 minute

    return reply.send(user);
  }

  @Post('/:id/invalidate')
  async invalidateUser(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const { id } = request.params;
    const userCache = request.server.cache.getCache<User>('users');

    userCache.delete(`user:${id}`);

    return reply.send({ success: true });
  }
}
```

## LRU Eviction

When `maxEntries` is reached, the least recently used entry is evicted:

```typescript
const cache = createCache<string>({ maxEntries: 3 });

cache.set('a', '1');  // Cache: [a]
cache.set('b', '2');  // Cache: [a, b]
cache.set('c', '3');  // Cache: [a, b, c]

cache.get('a');       // Access 'a', making it recently used

cache.set('d', '4');  // Evicts 'b' (least recently used)
                      // Cache: [a, c, d]

cache.get('b');       // Returns undefined
```

Expired entries are evicted before LRU entries when space is needed.

## TTL Behavior

- Entries without TTL never expire
- Expired entries are removed on access (`get`, `has`)
- Use `prune()` to proactively remove expired entries
- Per-entry TTL overrides the cache's `defaultTtlMs`

```typescript
const cache = createCache<string>({ defaultTtlMs: 60000 }); // 1 minute default

cache.set('short', 'value', { ttlMs: 5000 });   // Expires in 5 seconds
cache.set('default', 'value');                   // Expires in 1 minute
cache.set('long', 'value', { ttlMs: 300000 });  // Expires in 5 minutes
```

## Cache Key Naming Convention

Use descriptive, hierarchical key names:

```typescript
// Good examples:
'user:123'
'user:123:profile'
'session:abc-def'
'config:feature-flags'

// Avoid:
'key1'
'data'
```

## TTL Guidelines

| Use Case | Recommended TTL |
|----------|-----------------|
| Hot data (frequently changing) | 5-30 seconds |
| User sessions | 5-15 minutes |
| Reference data | 5-60 minutes |
| Static configuration | 1-24 hours |

## Important Notes

- **In-memory only**: Cache is not shared across process instances
- **No persistence**: Cache is cleared on process restart
- **Thread-safe**: Safe for concurrent access within a single Node.js process
- **Automatic cleanup**: Plugin clears all caches on Fastify close
