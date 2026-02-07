import { registerAlgorithm, getAlgorithm, getRegisteredAlgorithms } from '../../../src/middleware/http-signature/algorithms/index.js';

describe('algorithm registry', () => {
  it('should register and retrieve an algorithm', () => {
    const mockAlgo = {
      name: 'test-algo',
      verify: jest.fn(),
      sign: jest.fn(),
    };

    registerAlgorithm(mockAlgo);
    const retrieved = getAlgorithm('test-algo');

    expect(retrieved).toBe(mockAlgo);
  });

  it('should return undefined for unregistered algorithm', () => {
    const result = getAlgorithm('nonexistent-algo');
    expect(result).toBeUndefined();
  });

  it('should list all registered algorithms', () => {
    const algos = getRegisteredAlgorithms();
    expect(Array.isArray(algos)).toBe(true);
  });
});
