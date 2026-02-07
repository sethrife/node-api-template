import { createKeyResolver } from '../../../src/middleware/http-signature/jwks.js';
import { createRemoteJWKSet } from 'jose';

// The jose mock is automatically loaded from test/__mocks__/jose.ts

describe('KeyResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a resolver with JWKS URL', () => {
    const resolver = createKeyResolver('https://example.com/.well-known/jwks.json');
    expect(resolver).toBeDefined();
    expect(typeof resolver.resolve).toBe('function');
  });

  it('should call createRemoteJWKSet with correct URL', () => {
    const url = 'https://example.com/.well-known/jwks.json';
    createKeyResolver(url);

    expect(createRemoteJWKSet).toHaveBeenCalledWith(new URL(url));
  });
});
