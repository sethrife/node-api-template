import { buildApp } from '../../src/app';
import { FastifyInstance } from 'fastify';
import * as sql from 'mssql';

describe('MssqlService', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('query', () => {
    it('should execute a SQL query', async () => {
      const result = await app.mssql.query('SELECT 1 AS result');
      expect(result).toHaveProperty('recordset');
    });

    it('should execute a query with parameters', async () => {
      const result = await app.mssql.query('SELECT * FROM users WHERE id = @id', {
        id: 1,
      });
      expect(result).toHaveProperty('recordset');
    });
  });

  describe('execute', () => {
    it('should execute a stored procedure', async () => {
      const result = await app.mssql.execute('sp_GetUsers');
      expect(result).toHaveProperty('recordset');
      expect(result).toHaveProperty('returnValue');
    });

    it('should execute a stored procedure with parameters', async () => {
      const result = await app.mssql.execute('sp_GetUserById', { id: 1 });
      expect(result).toHaveProperty('recordset');
      expect(result).toHaveProperty('returnValue');
    });
  });

  describe('beginTransaction', () => {
    it('should begin a transaction', async () => {
      const transaction = await app.mssql.beginTransaction();
      expect(transaction).toBeDefined();
      expect(transaction.begin).toBeDefined();
      expect(transaction.commit).toBeDefined();
      expect(transaction.rollback).toBeDefined();
    });
  });

  describe('ping', () => {
    it('should ping the database and return true', async () => {
      const result = await app.mssql.ping();
      expect(result).toBe(true);
    });
  });

  describe('getPool', () => {
    it('should return the raw connection pool', () => {
      const pool = app.mssql.getPool();
      expect(pool).toBeDefined();
      expect(pool).toHaveProperty('connect');
      expect(pool).toHaveProperty('close');
    });

    it('should allow advanced operations with raw pool', async () => {
      const pool = app.mssql.getPool();
      const request = pool.request();
      expect(request).toBeDefined();
    });
  });

  describe('isConnected', () => {
    it('should return connection status', () => {
      const isConnected = app.mssql.isConnected();
      expect(typeof isConnected).toBe('boolean');
    });
  });

  describe('availability to controllers', () => {
    it('should be accessible via app.mssql', () => {
      expect(app.mssql).toBeDefined();
      expect(app.mssql.query).toBeDefined();
      expect(app.mssql.execute).toBeDefined();
      expect(app.mssql.ping).toBeDefined();
    });
  });
});
