import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import sql from 'mssql';
import { MssqlService } from '../services/mssql.service.js';
import { config as appConfig } from '../config/index.js';

const mssqlPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // MSSQL configuration from centralized config
  const mssqlConfig: sql.config = appConfig.mssql;

  // Create connection pool
  const pool = new sql.ConnectionPool(mssqlConfig);

  // Create MssqlService wrapper
  const mssqlService = new MssqlService(pool);

  // Connect to database on server ready
  fastify.addHook('onReady', async () => {
    try {
      await pool.connect();
      fastify.log.info(
        {
          server: mssqlConfig.server,
          database: mssqlConfig.database,
        },
        'MSSQL connection established successfully'
      );

      // Verify connection with ping
      const isConnected = await mssqlService.ping();
      if (!isConnected) {
        throw new Error('MSSQL ping check failed');
      }
      fastify.log.info('MSSQL connection verified');
    } catch (error) {
      fastify.log.error(error, 'MSSQL connection failed');
      throw error;
    }
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    try {
      await pool.close();
      fastify.log.info('MSSQL connection closed');
    } catch (error) {
      fastify.log.error(error, 'Error closing MSSQL connection');
    }
  });

  // Decorate Fastify instance with MssqlService
  fastify.decorate('mssql', mssqlService);
};

export default fp(mssqlPlugin, {
  name: 'mssql',
});
