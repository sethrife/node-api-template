import RedisMock from 'ioredis-mock';

// Mock ioredis with ioredis-mock for all tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    return new RedisMock();
  });
});
