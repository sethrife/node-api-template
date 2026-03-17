import fp from 'fastify-plugin';
import formbody from '@fastify/formbody';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';

const formbodyPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  await fastify.register(formbody);
};

export default fp(formbodyPlugin, {
  fastify: '5.x',
  name: 'formbody-plugin',
});
