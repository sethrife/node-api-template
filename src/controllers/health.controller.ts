import { FastifyRequest, FastifyReply } from 'fastify';
import { Controller, Get } from '../decorators/route.decorator';

@Controller('/health')
export class HealthController {
  @Get('/')
  async healthCheck(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  }
}
