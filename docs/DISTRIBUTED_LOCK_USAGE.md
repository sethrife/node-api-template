# Distributed Lock Usage Guide

The RedisService now includes distributed locking capabilities using redlock-universal. This ensures only one process can execute a critical section at a time across multiple instances.

## Available Methods

### 1. `withLock()` - Execute Function with Automatic Lock Management

The simplest way to use distributed locks. Automatically acquires and releases the lock.

```typescript
// In a controller or service
const result = await request.server.redis.withLock(
  'my-lock-key',
  30000, // TTL in milliseconds (30 seconds)
  async () => {
    // Only one process can execute this code at a time
    console.log('Performing critical operation...');
    return await performCriticalOperation();
  }
);
```

### 2. `runImportWithLock()` - Purpose-Built for Import Processes

Designed specifically for import processes with better error handling.

```typescript
const result = await request.server.redis.runImportWithLock(
  'customer-import', // Unique import identifier
  async () => {i 
    // Import logic here
    const customers = await fetchCustomersFromAPI();
    await saveCustomersToDatabase(customers);
    return { imported: customers.length };
  },
  300000 // 5 minute lock TTL
);

if (result.acquired) {
  console.log('Import completed:', result.result);
} else {
  console.log('Import already running:', result.error);
}
```

### 3. Manual Lock Management

For more control over lock acquisition and release.

```typescript
// Acquire lock
const lockData = await request.server.redis.acquireLock('my-lock', 30000);

if (lockData) {
  try {
    // Perform operation while holding lock
    await performOperation();
  } finally {
    // Always release the lock
    await request.server.redis.releaseLock(lockData);
  }
} else {
  // Lock is already held by another process
  console.log('Could not acquire lock');
}
```

## Example: Import Process Controller

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { Controller, Post } from '../decorators/route.decorator.js';

@Controller('/api/import')
export class ImportController {
  @Post('/customers')
  async importCustomers(request: FastifyRequest, reply: FastifyReply) {
    const result = await request.server.redis.runImportWithLock(
      'customer-import',
      async () => {
        // Simulate import process
        request.log.info('Starting customer import...');

        // Fetch data from external source
        const customers = await fetchCustomersFromAPI();

        // Process and save to database
        for (const customer of customers) {
          await request.server.mssql.query(
            'INSERT INTO customers (name, email) VALUES (@name, @email)',
            { name: customer.name, email: customer.email }
          );
        }

        request.log.info(`Imported ${customers.length} customers`);
        return { count: customers.length };
      },
      300000 // 5 minute lock
    );

    if (!result.acquired) {
      return reply.code(409).send({
        error: 'Import already in progress',
        message: result.error
      });
    }

    if (result.error) {
      return reply.code(500).send({
        error: 'Import failed',
        message: result.error
      });
    }

    return reply.send({
      success: true,
      imported: result.result?.count || 0
    });
  }
}
```

## Key Features

- **Automatic Retry**: Retries lock acquisition up to 3 times with 200ms delays
- **TTL Protection**: Locks automatically expire after the specified TTL
- **Process Coordination**: Only one process across all instances can hold the lock
- **Error Handling**: Graceful handling of lock acquisition failures
- **Clean Releases**: Locks are always released, even if the function throws an error

## Lock Key Naming Convention

Use descriptive, hierarchical key names:

```typescript
// Good examples:
'import:lock:customers'
'import:lock:orders'
'job:lock:email-queue'
'cache:rebuild:products'

// Avoid:
'lock1'
'mylock'
```

## TTL Guidelines

- **Short operations** (< 10s): 30000ms (30s)
- **Import processes**: 300000ms (5 minutes)
- **Long-running jobs**: 600000ms (10 minutes)

**Important**: Set TTL longer than your expected operation time to prevent premature release, but not so long that failed processes block others unnecessarily.
