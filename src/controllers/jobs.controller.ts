import { FastifyInstance } from 'fastify';
import { SchedulerService, JobNotFoundError } from '../services/scheduler.service.js';

export function registerJobsController(app: FastifyInstance, scheduler: SchedulerService): void {
  app.get('/api/jobs', async (_request, reply) => {
    return reply.send(scheduler.list());
  });

  app.post<{ Params: { name: string } }>(
    '/api/jobs/:name/run',
    async (request, reply) => {
      try {
        const result = scheduler.run(request.params.name);
        return reply.code(202).send({ name: request.params.name, ...result });
      } catch (err) {
        if (err instanceof JobNotFoundError) {
          return reply.code(404).send({ error: 'Job not found', name: request.params.name });
        }
        throw err;
      }
    }
  );
}
