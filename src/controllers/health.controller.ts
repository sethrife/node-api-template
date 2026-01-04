import { FastifyRequest, FastifyReply } from 'fastify';
import { Controller, Get } from '../decorators/route.decorator.js';

// Helper function to timeout a promise after specified milliseconds
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutHandle);
  });
}

@Controller('/health')
export class HealthController {
  @Get('/')
  async healthCheck(request: FastifyRequest, reply: FastifyReply) {
    // Run health checks in parallel with individual timeouts (max 3s each)
    const [redisResult, mssqlResult] = await Promise.allSettled([
      withTimeout(request.server.redis.ping(), 5000, 'Redis ping timeout after 5 seconds'),
      withTimeout(request.server.mssql.ping(), 5000, 'MSSQL ping timeout after 5 seconds'),
    ]);

    // Process Redis result
    let redisStatus = 'ok';
    let redisError: string | undefined;
    if (redisResult.status === 'fulfilled') {
      redisStatus = redisResult.value === 'PONG' ? 'ok' : 'error';
    } else {
      redisStatus = 'error';
      redisError =
        redisResult.reason instanceof Error ? redisResult.reason.message : 'Unknown error';
    }

    // Process MSSQL result
    let mssqlStatus = 'ok';
    let mssqlError: string | undefined;
    if (mssqlResult.status === 'fulfilled') {
      mssqlStatus = mssqlResult.value ? 'ok' : 'error';
    } else {
      mssqlStatus = 'error';
      mssqlError =
        mssqlResult.reason instanceof Error ? mssqlResult.reason.message : 'Unknown error';
    }

    const overallStatus = redisStatus === 'ok' && mssqlStatus === 'ok' ? 'ok' : 'degraded';

    return reply.send({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        redis: {
          status: redisStatus,
          ...(redisError && { error: redisError }),
        },
        mssql: {
          status: mssqlStatus,
          ...(mssqlError && { error: mssqlError }),
        },
      },
    });
  }
}
