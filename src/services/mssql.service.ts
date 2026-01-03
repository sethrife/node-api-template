import * as sql from 'mssql';

export class MssqlService {
  constructor(private pool: sql.ConnectionPool) {}

  /**
   * Execute a SQL query
   */
  async query<T = any>(queryString: string, params?: Record<string, any>): Promise<sql.IResult<T>> {
    const request = this.pool.request();

    // Bind parameters if provided
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        request.input(key, value);
      }
    }

    return await request.query<T>(queryString);
  }

  /**
   * Execute a stored procedure
   */
  async execute<T = any>(
    procedureName: string,
    params?: Record<string, any>
  ): Promise<sql.IProcedureResult<T>> {
    const request = this.pool.request();

    // Bind parameters if provided
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        request.input(key, value);
      }
    }

    return await request.execute<T>(procedureName);
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(): Promise<sql.Transaction> {
    const transaction = new sql.Transaction(this.pool);
    await transaction.begin();
    return transaction;
  }

  /**
   * Ping the database to verify connection
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 AS ping');
      return result.recordset[0]?.ping === 1;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the raw connection pool for advanced operations
   */
  getPool(): sql.ConnectionPool {
    return this.pool;
  }

  /**
   * Check if the connection pool is connected
   */
  isConnected(): boolean {
    return this.pool.connected;
  }
}
