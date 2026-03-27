import { FastifyInstance } from 'fastify';
import { isJobClass, getCrons } from '../decorators/cron.decorator.js';
import { registerJobsController } from '../controllers/jobs.controller.js';

export function registerJobs(app: FastifyInstance, jobClasses: any[]): void {
  for (const JobClass of jobClasses) {
    if (!isJobClass(JobClass)) continue;

    const instance = new JobClass();
    const crons = getCrons(JobClass);

    for (const cron of crons) {
      const handler = (instance[cron.methodName] as () => Promise<void>).bind(instance);
      app.scheduler.add({
        name: cron.name,
        schedule: cron.expression,
        handler,
        retry: cron.retry,
      });
    }
  }

  registerJobsController(app, app.scheduler);
}
