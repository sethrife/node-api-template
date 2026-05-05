import { createRemoteJWKSet, type CryptoKey } from 'jose';

export interface KeyResolver {
  resolve(keyId: string, algorithm: string): Promise<CryptoKey>;
}

// Cache resolvers by URL so each unique JWKS endpoint gets one RemoteJWKSet
// instance (which maintains its own key cache and refresh logic).
const resolverCache = new Map<string, KeyResolver>();

/** Clear the resolver cache. Intended for use in tests. */
export function clearResolverCache(): void {
  resolverCache.clear();
}

/**
 * Return a key resolver for the given JWKS URL, creating one if needed.
 * Resolvers are cached by URL so a single RemoteJWKSet is shared across requests.
 */
export function createKeyResolver(jwksUrl: string): KeyResolver {
  const cached = resolverCache.get(jwksUrl);
  if (cached) return cached;

  const getKey = createRemoteJWKSet(new URL(jwksUrl));

  const resolver: KeyResolver = {
    async resolve(keyId: string, algorithm: string): Promise<CryptoKey> {
      const joseAlg = mapToJoseAlgorithm(algorithm);
      return getKey(
        { kid: keyId, alg: joseAlg },
        { payload: '', signature: '' } as any // Token not used for signature verification
      );
    },
  };

  resolverCache.set(jwksUrl, resolver);
  return resolver;
}

function mapToJoseAlgorithm(algorithm: string): string {
  switch (algorithm) {
    case 'rsa-pss-sha512':
      return 'PS512';
    case 'rsa-v1_5-sha256':
      return 'RS256';
    default:
      return algorithm.toUpperCase();
  }
}
