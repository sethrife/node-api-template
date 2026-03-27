import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { SchedulerService } from '../services/scheduler.service.js';

const schedulerPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const service = new SchedulerService(fastify.log);

  fastify.addHook('onClose', async () => {
    await service.stop();
  });

  fastify.decorate('scheduler', service);
};

export default fp(schedulerPlugin, {
  name: 'scheduler',
});
