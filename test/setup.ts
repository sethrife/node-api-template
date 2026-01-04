// Set required environment variables for tests
process.env.JWKS_URL = 'https://test.example.com/.well-known/jwks.json';

// Mock redis with custom in-memory implementation for all tests
jest.mock('redis', () => {
  const mockStore = new Map<string, { value: string; expiry?: number }>();

  const mockClient: any = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn().mockReturnThis(),
    get: jest.fn(async (key: string) => {
      const item = mockStore.get(key);
      if (!item) return null;
      if (item.expiry && Date.now() > item.expiry) {
        mockStore.delete(key);
        return null;
      }
      return item.value;
    }),
    set: jest.fn(async (key: string, value: string, options?: { EX?: number }) => {
      const expiry = options?.EX ? Date.now() + options.EX * 1000 : undefined;
      mockStore.set(key, { value, expiry });
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (mockStore.delete(key)) count++;
      }
      return count;
    }),
    exists: jest.fn(async (key: string) => {
      return mockStore.has(key) ? 1 : 0;
    }),
    expire: jest.fn(async (key: string, seconds: number) => {
      const item = mockStore.get(key);
      if (item) {
        item.expiry = Date.now() + seconds * 1000;
        return 1;
      }
      return 0;
    }),
    ping: jest.fn().mockResolvedValue('PONG'),
    keys: jest.fn(async (pattern: string) => {
      // Simple implementation - just return all keys for '*' pattern
      return Array.from(mockStore.keys());
    }),
    ttl: jest.fn(async (key: string) => {
      const item = mockStore.get(key);
      if (!item || !item.expiry) return -1;
      const remaining = Math.ceil((item.expiry - Date.now()) / 1000);
      return remaining > 0 ? remaining : -2;
    }),
    hSet: jest.fn(async (key: string, field: string, value: string) => {
      const hashKey = `hash:${key}`;
      let hash = mockStore.get(hashKey);
      if (!hash) {
        hash = { value: JSON.stringify({}), expiry: undefined };
        mockStore.set(hashKey, hash);
      }
      const data = JSON.parse(hash.value);
      data[field] = value;
      hash.value = JSON.stringify(data);
      return 1;
    }),
    hGet: jest.fn(async (key: string, field: string) => {
      const hashKey = `hash:${key}`;
      const hash = mockStore.get(hashKey);
      if (!hash) return null;
      const data = JSON.parse(hash.value);
      return data[field] || null;
    }),
    // Add lowercase aliases for compatibility
    hset: jest.fn(async (key: string, field: string, value: string) => {
      return mockClient.hSet(key, field, value);
    }),
    hget: jest.fn(async (key: string, field: string) => {
      return mockClient.hGet(key, field);
    }),
  };

  return {
    createClient: jest.fn(() => mockClient),
  };
});

// Mock mssql for all tests
jest.mock('mssql', () => {
  const mockData = new Map<string, any>();

  const mockRequest = {
    input: jest.fn().mockReturnThis(),
    query: jest.fn().mockImplementation(async (queryString: string) => {
      // Handle ping query
      if (queryString.includes('SELECT 1')) {
        return { recordset: [{ ping: 1 }] };
      }
      // Handle SELECT queries
      if (queryString.toUpperCase().startsWith('SELECT')) {
        return { recordset: [] };
      }
      return { recordset: [], rowsAffected: [0] };
    }),
    execute: jest.fn().mockResolvedValue({ recordset: [], returnValue: 0 }),
  };

  const mockTransaction = {
    begin: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    request: jest.fn().mockReturnValue(mockRequest),
  };

  const mockPool = {
    connected: true,
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    request: jest.fn().mockReturnValue(mockRequest),
  };

  return {
    ConnectionPool: jest.fn().mockImplementation(() => mockPool),
    Transaction: jest.fn().mockImplementation(() => mockTransaction),
    Request: jest.fn().mockImplementation(() => mockRequest),
  };
});
