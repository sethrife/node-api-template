import RedisMock from 'ioredis-mock';

// Mock ioredis with ioredis-mock for all tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    return new RedisMock();
  });
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
