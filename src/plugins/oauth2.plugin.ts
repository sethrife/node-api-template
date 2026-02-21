import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { OAuth2Service } from '../services/oauth2/index.js';
import { config } from '../config/index.js';

const oauth2Plugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const oauth2Service = new OAuth2Service(
    config.oauth2.providers,
    fastify.log,
    config.oauth2.refreshBufferSeconds
  );

  // Log discovered providers (without secrets)
  const providerNames = Object.keys(config.oauth2.providers);
  if (providerNames.length > 0) {
    fastify.log.info({ providers: providerNames }, 'OAuth2 providers configured');
  }

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    oauth2Service.clearCache();
    fastify.log.debug('OAuth2 token cache cleared on shutdown');
  });

  // Decorate Fastify instance with OAuth2Service
  fastify.decorate('oauth2', oauth2Service);
};

export default fp(oauth2Plugin, {
  name: 'oauth2',
});
