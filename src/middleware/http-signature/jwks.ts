import { createRemoteJWKSet, type CryptoKey } from 'jose';

export interface KeyResolver {
  resolve(keyId: string, algorithm: string): Promise<CryptoKey>;
}

/**
 * Create a key resolver that fetches keys from a JWKS endpoint
 */
export function createKeyResolver(jwksUrl: string): KeyResolver {
  const getKey = createRemoteJWKSet(new URL(jwksUrl));

  return {
    async resolve(keyId: string, algorithm: string): Promise<CryptoKey> {
      // Map our algorithm names to JOSE algorithm identifiers
      const joseAlg = mapToJoseAlgorithm(algorithm);

      // Fetch the key from JWKS
      const key = await getKey(
        { alg: joseAlg },
        { payload: '', signature: '' } as any // Token not used for signature verification
      );

      return key;
    },
  };
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

// Lazy-initialized default resolver
let defaultResolver: KeyResolver | null = null;

export function getDefaultKeyResolver(jwksUrl: string): KeyResolver {
  if (!defaultResolver) {
    defaultResolver = createKeyResolver(jwksUrl);
  }
  return defaultResolver;
}

export function resetDefaultKeyResolver(): void {
  defaultResolver = null;
}
