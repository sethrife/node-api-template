import { createKeyResolver, clearResolverCache } from '../../../src/middleware/http-signature/jwks.js';
import { createRemoteJWKSet } from 'jose';

// The jose mock is automatically loaded from test/__mocks__/jose.ts

describe('KeyResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearResolverCache();
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

  it('should pass kid and alg to the jose getter', async () => {
    const url = 'https://example.com/.well-known/jwks.json';
    const mockKey = {};
    const mockGetter = jest.fn().mockResolvedValue(mockKey);
    (createRemoteJWKSet as jest.Mock).mockReturnValue(mockGetter);

    const resolver = createKeyResolver(url);
    await resolver.resolve('my-key-id', 'rsa-pss-sha512');

    expect(mockGetter).toHaveBeenCalledWith(
      expect.objectContaining({ kid: 'my-key-id', alg: 'PS512' }),
      expect.anything()
    );
  });

  it('should return the same resolver for the same URL', () => {
    const url = 'https://example.com/.well-known/jwks.json';
    const r1 = createKeyResolver(url);
    const r2 = createKeyResolver(url);
    expect(r1).toBe(r2);
  });
});
