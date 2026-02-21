import type { FastifyBaseLogger } from 'fastify';
import type {
  OAuth2ProviderConfig,
  OAuth2FetchOptions,
  TokenExchangeOptions,
  CachedToken,
  IOAuth2Service,
} from './types.js';
import { OAuth2Error } from './errors.js';
import { TokenCache } from './token-cache.js';
import { fetchClientCredentialsToken } from './client-credentials.js';
import { fetchTokenExchange } from './token-exchange.js';

export class OAuth2Service implements IOAuth2Service {
  private cache = new TokenCache();
  private refreshBufferSeconds: number;

  constructor(
    private providers: Record<string, OAuth2ProviderConfig>,
    private logger: FastifyBaseLogger,
    refreshBufferSeconds = 30
  ) {
    this.refreshBufferSeconds = refreshBufferSeconds;
  }

  /**
   * Make an authenticated fetch request to a protected API
   */
  async fetch(provider: string, url: string, options: OAuth2FetchOptions = {}): Promise<Response> {
    const { tokenExchange, signer, headers = {}, ...fetchOptions } = options;

    // Get access token
    const accessToken = await this.getToken(provider, tokenExchange);

    // Build headers with Authorization
    let requestHeaders: Record<string, string> = {
      ...headers,
      Authorization: `Bearer ${accessToken}`,
    };

    // Sign request if signer provided
    if (signer) {
      requestHeaders = await signer.sign({
        method: (fetchOptions.method as string) || 'GET',
        url,
        headers: requestHeaders,
        body: fetchOptions.body as string | undefined,
      });
    }

    // Make the request
    let response = await fetch(url, {
      ...fetchOptions,
      headers: requestHeaders,
    });

    // Retry once on 401 with fresh token
    if (response.status === 401) {
      this.logger.debug({ provider, url }, 'Received 401, refreshing token and retrying');

      // Clear cached token and get fresh one
      const cacheKey = this.buildCacheKey(provider, tokenExchange);
      this.cache.delete(cacheKey);

      const freshToken = await this.getToken(provider, tokenExchange);
      requestHeaders.Authorization = `Bearer ${freshToken}`;

      // Re-sign if needed
      if (signer) {
        requestHeaders = await signer.sign({
          method: (fetchOptions.method as string) || 'GET',
          url,
          headers: requestHeaders,
          body: fetchOptions.body as string | undefined,
        });
      }

      response = await fetch(url, {
        ...fetchOptions,
        headers: requestHeaders,
      });
    }

    return response;
  }

  /**
   * Get an access token for a provider (from cache or fresh)
   */
  async getToken(provider: string, tokenExchange?: TokenExchangeOptions): Promise<string> {
    const config = this.providers[provider];
    if (!config) {
      throw new OAuth2Error(
        `OAuth2 provider '${provider}' not configured`,
        'provider_not_found',
        provider
      );
    }

    const cacheKey = this.buildCacheKey(provider, tokenExchange);
    const cached = this.cache.get(cacheKey);

    // Return cached token if valid and not needing refresh
    if (cached && !this.cache.isExpired(cached)) {
      // Trigger background refresh if needed
      if (this.cache.needsRefresh(cached)) {
        this.refreshTokenInBackground(provider, cacheKey, config, tokenExchange);
      }
      return cached.accessToken;
    }

    // Fetch fresh token
    return this.fetchAndCacheToken(provider, cacheKey, config, tokenExchange);
  }

  /**
   * Clear the token cache
   */
  clearCache(provider?: string): void {
    this.cache.clear(provider);
    this.logger.debug({ provider: provider || 'all' }, 'OAuth2 token cache cleared');
  }

  private buildCacheKey(provider: string, tokenExchange?: TokenExchangeOptions): string {
    if (tokenExchange) {
      // Use hash of subject token as key to avoid storing full token
      const subjectHash = this.hashString(tokenExchange.subjectToken).slice(0, 16);
      return this.cache.buildKey(provider, 'token_exchange', subjectHash);
    }
    return this.cache.buildKey(provider, 'client_credentials');
  }

  private async fetchAndCacheToken(
    provider: string,
    cacheKey: string,
    config: OAuth2ProviderConfig,
    tokenExchange?: TokenExchangeOptions
  ): Promise<string> {
    // Check for in-flight refresh
    const existingPromise = this.cache.getRefreshPromise(cacheKey);
    if (existingPromise) {
      const token = await existingPromise;
      return token.accessToken;
    }

    // Create fetch promise
    const fetchPromise = this.doFetchToken(provider, config, tokenExchange);
    this.cache.setRefreshPromise(cacheKey, fetchPromise);

    try {
      const token = await fetchPromise;
      this.cache.set(cacheKey, token);
      this.logger.info({ provider, flow: tokenExchange ? 'token_exchange' : 'client_credentials' }, 'OAuth2 token fetched');
      return token.accessToken;
    } finally {
      this.cache.clearRefreshPromise(cacheKey);
    }
  }

  private async doFetchToken(
    provider: string,
    config: OAuth2ProviderConfig,
    tokenExchange?: TokenExchangeOptions
  ): Promise<CachedToken> {
    try {
      if (tokenExchange) {
        return await fetchTokenExchange(config, tokenExchange, this.refreshBufferSeconds);
      }
      return await fetchClientCredentialsToken(config, this.refreshBufferSeconds);
    } catch (error) {
      if (error instanceof OAuth2Error) {
        error.provider = provider;
        throw error;
      }
      throw new OAuth2Error(
        `Token fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'token_fetch_failed',
        provider
      );
    }
  }

  private refreshTokenInBackground(
    provider: string,
    cacheKey: string,
    config: OAuth2ProviderConfig,
    tokenExchange?: TokenExchangeOptions
  ): void {
    // Don't start another refresh if one is in progress
    if (this.cache.getRefreshPromise(cacheKey)) {
      return;
    }

    const refreshPromise = this.doFetchToken(provider, config, tokenExchange);
    this.cache.setRefreshPromise(cacheKey, refreshPromise);

    refreshPromise
      .then((token) => {
        this.cache.set(cacheKey, token);
        this.logger.debug({ provider }, 'OAuth2 token refreshed in background');
      })
      .catch((error) => {
        this.logger.warn({ provider, error: error.message }, 'Background token refresh failed');
      })
      .finally(() => {
        this.cache.clearRefreshPromise(cacheKey);
      });
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

// Re-export types and errors
export { OAuth2Error } from './errors.js';
export type {
  OAuth2ProviderConfig,
  OAuth2Config,
  OAuth2FetchOptions,
  TokenExchangeOptions,
  IOAuth2Service,
} from './types.js';
