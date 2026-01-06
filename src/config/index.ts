/**
 * Application Configuration
 * Centralizes all environment variables with type safety and validation
 */

interface ServerConfig {
  port: number;
  host: string;
}

interface JwtConfig {
  jwksUrl: string | undefined;
}

interface RedisConfig {
  host: string;
  port: number;
  password: string | undefined;
  database: number;
}

interface MssqlConfig {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
    enableArithAbort: boolean;
    connectTimeout: number;
    requestTimeout: number;
  };
  pool: {
    max: number;
    min: number;
    idleTimeoutMillis: number;
  };
  connectionTimeout: number;
}

interface AppConfig {
  server: ServerConfig;
  jwt: JwtConfig;
  redis: RedisConfig;
  mssql: MssqlConfig;
}

/**
 * Parse environment variable as integer with fallback
 */
function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse environment variable as boolean
 */
function getEnvBool(key: string, defaultValue = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Get environment variable as string with optional fallback
 */
function getEnvString(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}

/**
 * Application configuration object
 */
export const config: AppConfig = {
  server: {
    port: getEnvInt('PORT', 3000),
    host: getEnvString('HOST', '0.0.0.0')!,
  },

  jwt: {
    jwksUrl: getEnvString('JWKS_URL'),
  },

  redis: {
    host: getEnvString('REDIS_HOST', 'localhost')!,
    port: getEnvInt('REDIS_PORT', 6379),
    password: getEnvString('REDIS_PASSWORD'),
    database: getEnvInt('REDIS_DB', 0),
  },

  mssql: {
    server: getEnvString('MSSQL_SERVER', 'localhost')!,
    port: getEnvInt('MSSQL_PORT', 1433),
    database: getEnvString('MSSQL_DATABASE', 'master')!,
    user: getEnvString('MSSQL_USER', 'sa')!,
    password: getEnvString('MSSQL_PASSWORD', 'RosieEnzoNeo@26')!,
    options: {
      encrypt: getEnvBool('MSSQL_ENCRYPT'),
      trustServerCertificate: getEnvBool('MSSQL_TRUST_CERT'),
      enableArithAbort: true,
      connectTimeout: 30000,
      requestTimeout: 30000,
    },
    pool: {
      max: getEnvInt('MSSQL_POOL_MAX', 4),
      min: getEnvInt('MSSQL_POOL_MIN', 2),
      idleTimeoutMillis: 30000,
    },
    connectionTimeout: 30000,
  },
};

/**
 * Validate required configuration
 * Throws an error if required config is missing
 */
export function validateConfig(): void {
  const errors: string[] = [];

  // Add validation for required fields if needed
  // For now, most fields have defaults

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Export types for use in other modules
export type { AppConfig, ServerConfig, JwtConfig, RedisConfig, MssqlConfig };
