import { FastifyInstance } from 'fastify';
import { isJobClass, getCrons } from '../decorators/cron.decorator.js';
import { registerJobsController } from '../controllers/jobs.controller.js';

export function registerJobs(app: FastifyInstance, jobClasses: any[]): void {
  const startupJobs: string[] = [];

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
      if (cron.runOnStartup) {
        startupJobs.push(cron.name);
      }
    }
  }

  if (startupJobs.length > 0) {
    app.addHook('onReady', async () => {
      for (const name of startupJobs) {
        app.scheduler.run(name);
      }
    });
  }

  registerJobsController(app, app.scheduler);
}
