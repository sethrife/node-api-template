import { NodeRedisAdapter, createRedlock, type Lock } from 'redlock-universal';

export class RedisService {
  private adapter: NodeRedisAdapter;

  constructor(private client: any) {
    // Create Redis adapter for redlock-universal
    this.adapter = new NodeRedisAdapter(client);
  }

  /**
   * Get a value from Redis
   */
  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  /**
   * Set a value in Redis
   */
  async set(key: string, value: string): Promise<void> {
    await this.client.set(key, value);
  }

  /**
   * Set a value with expiration time (in seconds)
   */
  async setex(key: string, seconds: number, value: string): Promise<void> {
    await this.client.set(key, value, { EX: seconds });
  }

  /**
   * Delete a key from Redis
   */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Set expiration time on a key
   */
  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  /**
   * Ping Redis to check connection
   */
  async ping(): Promise<string> {
    return await this.client.ping();
  }

  /**
   * Get the raw Redis client for advanced operations
   */
  getClient(): any {
    return this.client;
  }

  /**
   * Create a lock instance for a specific key
   * @param lockKey - The unique identifier for the lock
   * @param ttl - Time to live in milliseconds (default: 30000ms = 30s)
   * @returns Lock instance
   */
  private createLock(lockKey: string, ttl: number = 30000): Lock {
    return createRedlock({
      adapters: [this.adapter],
      key: lockKey,
      ttl,
      retryAttempts: 3,
      retryDelay: 200,
    });
  }

  /**
   * Acquire a distributed lock and execute a function
   * Only one process can hold the lock at a time
   * @param lockKey - The unique identifier for the lock
   * @param ttl - Time to live in milliseconds (default: 30000ms = 30s)
   * @param fn - The function to execute while holding the lock
   * @returns The result of the function
   */
  async withLock<T>(lockKey: string, ttl: number = 30000, fn: () => Promise<T>): Promise<T> {
    const lock = this.createLock(lockKey, ttl);
    const handle = await lock.acquire();
    try {
      return await fn();
    } finally {
      await lock.release(handle);
    }
  }

  /**
   * Attempt to acquire a distributed lock
   * Returns the lock handle if successful, null if lock is already held
   * @param lockKey - The unique identifier for the lock
   * @param ttl - Time to live in milliseconds (default: 30000ms = 30s)
   * @returns Object with lock instance and handle, or null if unable to acquire
   */
  async acquireLock(
    lockKey: string,
    ttl: number = 30000
  ): Promise<{ lock: Lock; handle: any } | null> {
    try {
      const lock = this.createLock(lockKey, ttl);
      const handle = await lock.acquire();
      return { lock, handle };
    } catch (error) {
      // Lock is already held by another process
      return null;
    }
  }

  /**
   * Release a previously acquired lock
   * @param lockData - Object containing lock instance and handle
   */
  async releaseLock(lockData: { lock: Lock; handle: any } | null): Promise<void> {
    if (lockData) {
      await lockData.lock.release(lockData.handle);
    }
  }

  /**
   * Execute an import process with distributed locking
   * Only one process across all instances will run the import at a time
   * @param importKey - Unique identifier for this import process
   * @param importFn - The import function to execute
   * @param ttl - Lock duration in milliseconds (default: 300000ms = 5 minutes)
   * @returns Object with success status and result/error
   */
  async runImportWithLock<T>(
    importKey: string,
    importFn: () => Promise<T>,
    ttl: number = 300000
  ): Promise<{ acquired: boolean; result?: T; error?: string }> {
    const lockKey = `import:lock:${importKey}`;

    try {
      const result = await this.withLock(lockKey, ttl, importFn);
      return { acquired: true, result };
    } catch (error) {
      // Check if it's a lock acquisition error
      if (error instanceof Error && error.message.includes('lock')) {
        return {
          acquired: false,
          error: 'Another process is already running this import',
        };
      }
      // Other errors during execution
      return {
        acquired: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
