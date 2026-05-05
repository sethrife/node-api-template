import { createRemoteJWKSet, customFetch, type CryptoKey } from 'jose';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

export interface KeyResolver {
  resolve(keyId: string, algorithm: string): Promise<CryptoKey>;
}

// Cache resolvers by "url::proxy" so each unique (endpoint, proxy) pair gets
// one RemoteJWKSet instance (which maintains its own key cache and refresh logic).
const resolverCache = new Map<string, KeyResolver>();

/** Clear the resolver cache. Intended for use in tests. */
export function clearResolverCache(): void {
  resolverCache.clear();
}

/**
 * Return a key resolver for the given JWKS URL, creating one if needed.
 * Resolvers are cached by (url, proxy) so a single RemoteJWKSet is shared across requests.
 */
export function createKeyResolver(jwksUrl: string, proxy?: string): KeyResolver {
  const cacheKey = proxy ? `${jwksUrl}::${proxy}` : jwksUrl;
  const cached = resolverCache.get(cacheKey);
  if (cached) return cached;

  let fetchOptions: Record<symbol, typeof fetch> | undefined;
  if (proxy) {
    const agent = new ProxyAgent(proxy);
    fetchOptions = {
      [customFetch]: (url, options) =>
        undiciFetch(url as Parameters<typeof undiciFetch>[0], {
          ...(options as Parameters<typeof undiciFetch>[1]),
          dispatcher: agent,
        }) as unknown as Promise<Response>,
    };
  }

  const getKey = fetchOptions
    ? createRemoteJWKSet(new URL(jwksUrl), fetchOptions)
    : createRemoteJWKSet(new URL(jwksUrl));

  const resolver: KeyResolver = {
    async resolve(keyId: string, algorithm: string): Promise<CryptoKey> {
      const joseAlg = mapToJoseAlgorithm(algorithm);
      return getKey(
        { kid: keyId, alg: joseAlg },
        { payload: '', signature: '' } as any // Token not used for signature verification
      );
    },
  };

  resolverCache.set(cacheKey, resolver);
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
