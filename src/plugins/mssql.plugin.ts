import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import * as sql from 'mssql';
import { MssqlService } from '../services/mssql.service';

const mssqlPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // MSSQL configuration
  const config: sql.config = {
    server: process.env.MSSQL_SERVER || 'localhost',
    port: parseInt(process.env.MSSQL_PORT || '1433'),
    database: process.env.MSSQL_DATABASE,
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    options: {
      encrypt: process.env.MSSQL_ENCRYPT === 'true',
      trustServerCertificate: process.env.MSSQL_TRUST_CERT === 'true',
      enableArithAbort: true,
      connectTimeout: 30000,
      requestTimeout: 30000,
    },
    pool: {
      max: parseInt(process.env.MSSQL_POOL_MAX || '4'),
      min: parseInt(process.env.MSSQL_POOL_MIN || '2'),
      idleTimeoutMillis: 30000,
    },
    connectionTimeout: 30000,
  };

  // Create connection pool
  const pool = new sql.ConnectionPool(config);

  // Create MssqlService wrapper
  const mssqlService = new MssqlService(pool);

  // Connect to database on server ready
  fastify.addHook('onReady', async () => {
    try {
      await pool.connect();
      fastify.log.info(
        {
          server: config.server,
          database: config.database,
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
