import { FastifyRequest, FastifyReply } from 'fastify';
import { Controller, Get } from '../decorators/route.decorator';

@Controller('/health')
export class HealthController {
  @Get('/')
  async healthCheck(request: FastifyRequest, reply: FastifyReply) {
    let redisStatus = 'ok';
    let redisError: string | undefined;

    try {
      // Ping Redis to verify connection using RedisService
      const result = await request.server.redis.ping();
      redisStatus = result === 'PONG' ? 'ok' : 'error';
    } catch (error) {
      redisStatus = 'error';
      redisError = error instanceof Error ? error.message : 'Unknown error';
    }

    const overallStatus = redisStatus === 'ok' ? 'ok' : 'degraded';

    return reply.send({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        redis: {
          status: redisStatus,
          ...(redisError && { error: redisError }),
        },
      },
    });
  }
}
