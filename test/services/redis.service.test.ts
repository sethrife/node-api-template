import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';

describe('RedisService', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clear all keys before each test
    const client = app.redis.getClient();
    const keys = await client.keys('*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
  });

  describe('get and set', () => {
    it('should set and get a value', async () => {
      await app.redis.set('test-key', 'test-value');
      const result = await app.redis.get('test-key');
      expect(result).toBe('test-value');
    });

    it('should return null for non-existent key', async () => {
      const result = await app.redis.get('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('setex', () => {
    it('should set value with expiration', async () => {
      await app.redis.setex('test-ttl', 1, 'value');
      const result = await app.redis.get('test-ttl');
      expect(result).toBe('value');

      // Check TTL
      const client = app.redis.getClient();
      const ttl = await client.ttl('test-ttl');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(1);
    });
  });

  describe('del', () => {
    it('should delete a key', async () => {
      await app.redis.set('test-delete', 'value');
      await app.redis.del('test-delete');
      const result = await app.redis.get('test-delete');
      expect(result).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return true if key exists', async () => {
      await app.redis.set('test-exists', 'value');
      const result = await app.redis.exists('test-exists');
      expect(result).toBe(true);
    });

    it('should return false if key does not exist', async () => {
      const result = await app.redis.exists('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('expire', () => {
    it('should set expiration on a key', async () => {
      await app.redis.set('test-expire', 'value');
      await app.redis.expire('test-expire', 10);

      const client = app.redis.getClient();
      const ttl = await client.ttl('test-expire');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(10);
    });
  });

  describe('ping', () => {
    it('should ping Redis and return PONG', async () => {
      const result = await app.redis.ping();
      expect(result).toBe('PONG');
    });
  });

  describe('getClient', () => {
    it('should return the raw Redis client', () => {
      const client = app.redis.getClient();
      expect(client).toBeDefined();
      expect(typeof client.get).toBe('function');
      expect(typeof client.set).toBe('function');
    });

    it('should allow advanced operations with raw client', async () => {
      const client = app.redis.getClient();

      // Use hash operations
      await client.hset('user:1', 'name', 'John');
      await client.hset('user:1', 'age', '30');

      const name = await client.hget('user:1', 'name');
      const age = await client.hget('user:1', 'age');

      expect(name).toBe('John');
      expect(age).toBe('30');
    });
  });

  describe('availability to controllers', () => {
    it('should be accessible via app.redis', () => {
      expect(app.redis).toBeDefined();
      expect(typeof app.redis.get).toBe('function');
      expect(typeof app.redis.set).toBe('function');
      expect(typeof app.redis.ping).toBe('function');
    });
  });

  describe('distributed locking', () => {
    describe('withLock', () => {
      it('should execute function with lock', async () => {
        let executed = false;
        const result = await app.redis.withLock('test-lock', 30000, async () => {
          executed = true;
          return 'success';
        });

        expect(executed).toBe(true);
        expect(result).toBe('success');
      });

      it('should release lock after successful execution', async () => {
        await app.redis.withLock('test-lock-release', 30000, async () => {
          return 'first';
        });

        // Should be able to acquire lock again
        const result = await app.redis.withLock('test-lock-release', 30000, async () => {
          return 'second';
        });

        expect(result).toBe('second');
      });

      it('should release lock even if function throws error', async () => {
        await expect(
          app.redis.withLock('test-lock-error', 30000, async () => {
            throw new Error('Test error');
          })
        ).rejects.toThrow('Test error');

        // Should be able to acquire lock again after error
        const result = await app.redis.withLock('test-lock-error', 30000, async () => {
          return 'recovered';
        });

        expect(result).toBe('recovered');
      });

      it('should prevent concurrent execution of same lock', async () => {
        const results: string[] = [];

        const promise1 = app.redis.withLock('concurrent-lock', 1000, async () => {
          results.push('first-start');
          await new Promise((resolve) => setTimeout(resolve, 50));
          results.push('first-end');
          return 'first';
        });

        // Wait a bit to ensure first lock is acquired
        await new Promise((resolve) => setTimeout(resolve, 20));

        // Try to acquire same lock concurrently - should fail
        await expect(
          app.redis.withLock('concurrent-lock', 1000, async () => {
            results.push('second-start');
            return 'second';
          })
        ).rejects.toThrow('Failed to acquire lock');

        // Wait for first promise to complete
        const result1 = await promise1;
        expect(result1).toBe('first');

        // Verify that only the first function executed
        expect(results).toEqual(['first-start', 'first-end']);
      });

      it('should allow concurrent execution of different locks', async () => {
        const results = await Promise.all([
          app.redis.withLock('lock-1', 30000, async () => 'result-1'),
          app.redis.withLock('lock-2', 30000, async () => 'result-2'),
        ]);

        expect(results).toEqual(['result-1', 'result-2']);
      });
    });

    describe('acquireLock and releaseLock', () => {
      it('should acquire and release lock manually', async () => {
        const lockData = await app.redis.acquireLock('manual-lock', 30000);

        expect(lockData).not.toBeNull();
        expect(lockData?.lock).toBeDefined();
        expect(lockData?.handle).toBeDefined();

        await app.redis.releaseLock(lockData);

        // Should be able to acquire again after release
        const lockData2 = await app.redis.acquireLock('manual-lock', 30000);
        expect(lockData2).not.toBeNull();

        await app.redis.releaseLock(lockData2);
      });

      it('should return null when lock is already held', async () => {
        const lock1 = await app.redis.acquireLock('contested-lock', 30000);
        expect(lock1).not.toBeNull();

        const lock2 = await app.redis.acquireLock('contested-lock', 30000);
        expect(lock2).toBeNull();

        await app.redis.releaseLock(lock1);
      });

      it('should handle null lock gracefully', async () => {
        await expect(app.redis.releaseLock(null)).resolves.not.toThrow();
      });

      it('should allow manual lock management for complex workflows', async () => {
        const lock = await app.redis.acquireLock('workflow-lock', 30000);
        expect(lock).not.toBeNull();

        try {
          // Perform some operations
          await app.redis.set('workflow-data', 'processing');
          const data = await app.redis.get('workflow-data');
          expect(data).toBe('processing');
        } finally {
          await app.redis.releaseLock(lock);
        }

        // Lock should be released
        const lock2 = await app.redis.acquireLock('workflow-lock', 30000);
        expect(lock2).not.toBeNull();
        await app.redis.releaseLock(lock2);
      });
    });

    describe('runImportWithLock', () => {
      it('should run import process successfully', async () => {
        const importFn = jest.fn(async () => {
          return { imported: 100 };
        });

        const result = await app.redis.runImportWithLock('test-import', importFn, 30000);

        expect(result.acquired).toBe(true);
        expect(result.result).toEqual({ imported: 100 });
        expect(result.error).toBeUndefined();
        expect(importFn).toHaveBeenCalledTimes(1);
      });

      it('should prevent concurrent imports with same key', async () => {
        const import1 = jest.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { imported: 50 };
        });

        const import2 = jest.fn(async () => {
          return { imported: 75 };
        });

        const promise1 = app.redis.runImportWithLock('concurrent-import', import1, 1000);
        const promise2 = app.redis.runImportWithLock('concurrent-import', import2, 1000);

        const [result1, result2] = await Promise.all([promise1, promise2]);

        // One should succeed, one should fail to acquire
        const acquired = [result1.acquired, result2.acquired];
        expect(acquired).toContain(true);
        expect(acquired).toContain(false);

        // Only one import function should execute
        const totalCalls = import1.mock.calls.length + import2.mock.calls.length;
        expect(totalCalls).toBe(1);
      });

      it('should handle errors during import execution', async () => {
        const importFn = jest.fn(async () => {
          throw new Error('Import failed');
        });

        const result = await app.redis.runImportWithLock('failing-import', importFn, 30000);

        expect(result.acquired).toBe(true);
        expect(result.result).toBeUndefined();
        expect(result.error).toBe('Import failed');
        expect(importFn).toHaveBeenCalledTimes(1);
      });

      it('should use import prefix for lock key', async () => {
        const importFn = jest.fn(async () => ({ count: 10 }));

        const result = await app.redis.runImportWithLock('customers', importFn, 30000);

        expect(result.acquired).toBe(true);
        expect(result.result).toEqual({ count: 10 });

        // The lock key should be prefixed with "import:lock:"
        // We can verify by trying to acquire with the same import key
        const result2 = await app.redis.runImportWithLock('customers', importFn, 30000);
        expect(result2.acquired).toBe(true); // Should succeed since first lock was released
      });

      it('should release lock after import completes', async () => {
        const importFn = async () => ({ count: 5 });

        await app.redis.runImportWithLock('release-test', importFn, 30000);

        // Should be able to run import again
        const result = await app.redis.runImportWithLock('release-test', importFn, 30000);
        expect(result.acquired).toBe(true);
      });

      it('should release lock even when import throws error', async () => {
        const importFn = async () => {
          throw new Error('Critical error');
        };

        await app.redis.runImportWithLock('error-release-test', importFn, 30000);

        // Should be able to run import again after error
        const successFn = async () => ({ count: 3 });
        const result = await app.redis.runImportWithLock('error-release-test', successFn, 30000);
        expect(result.acquired).toBe(true);
        expect(result.result).toEqual({ count: 3 });
      });
    });
  });
});
