import fp from 'fastify-plugin';
import formbody from '@fastify/formbody';
import { FastifyInstance } from 'fastify';

async function formbodyPlugin(app: FastifyInstance) {
  await app.register(formbody);
}

export default fp(formbodyPlugin, {
  fastify: '5.x',
  name: 'formbody-plugin',
});
