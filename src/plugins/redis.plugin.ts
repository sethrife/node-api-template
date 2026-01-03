import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import Redis, { RedisOptions } from 'ioredis';
import { RedisService } from '../services/redis.service';

const redisPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Redis configuration
  const config: RedisOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: 7,
    retryStrategy: (times: number) => {
      // Exponential backoff: 100ms, 200ms, 400ms
      const delay = Math.min(times * 100, 3000);
      fastify.log.warn({ attempt: times, delay }, 'Retrying Redis connection');
      return delay;
    },
  };

  // Create Redis client
  const client = new Redis(config);

  // Create RedisService wrapper
  const redisService = new RedisService(client);

  // Verify connection on server ready
  fastify.addHook('onReady', async () => {
    try {
      const result = await client.ping();
      fastify.log.info({ result }, 'Redis connection established successfully');
    } catch (error) {
      fastify.log.error(error, 'Redis connection failed');
      throw error;
    }
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    try {
      await client.quit();
      fastify.log.info('Redis connection closed');
    } catch (error) {
      fastify.log.error(error, 'Error closing Redis connection');
    }
  });

  // Decorate Fastify instance with RedisService
  fastify.decorate('redis', redisService);
};

export default fp(redisPlugin, {
  name: 'redis',
});
