import { buildApp } from '../../src/app';
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
});
