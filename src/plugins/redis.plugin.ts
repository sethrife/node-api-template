import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { createClient, RedisClientOptions } from 'redis';
import { RedisService } from '../services/redis.service.js';
import { config as appConfig } from '../config/index.js';

const redisPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Redis configuration
  const redisConfig: RedisClientOptions = {
    socket: {
      host: appConfig.redis.host,
      port: appConfig.redis.port,
      tls: appConfig.redis.tls,
      rejectUnauthorized: appConfig.redis.rejectUnauthorized,
      ca: appConfig.redis.ca,
      cert: appConfig.redis.cert,
      key: appConfig.redis.key,
      reconnectStrategy: (retries: number) => {
        const delay = Math.min(retries * 50, 500);
        fastify.log.warn({ attempt: retries, delay }, 'Retrying Redis connection');
        return delay;
      },
    } as any,
    password: appConfig.redis.password,
    database: appConfig.redis.database,
  };

  // Create Redis client
  const client = createClient(redisConfig);

  // Handle Redis errors to prevent application crashes
  client.on('error', (error) => {
    fastify.log.error(error, 'Redis client error');
    // Don't throw - let reconnectStrategy handle reconnection
  });

  // Handle reconnection events
  client.on('reconnecting', () => {
    fastify.log.warn('Redis client reconnecting...');
  });

  client.on('ready', () => {
    fastify.log.info('Redis client ready');
  });

  // Connect to Redis (eager connection)
  await client.connect();

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
      await client.disconnect();
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
