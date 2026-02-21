import type { Signer } from '../../middleware/http-signature/types.js';

/**
 * OAuth2 provider configuration
 */
export interface OAuth2ProviderConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
}

/**
 * OAuth2 configuration with all providers
 */
export interface OAuth2Config {
  providers: Record<string, OAuth2ProviderConfig>;
  refreshBufferSeconds: number;
}

/**
 * Cached token with expiry metadata
 */
export interface CachedToken {
  accessToken: string;
  expiresAt: number;
  refreshAt: number;
  scope?: string;
}

/**
 * Token response from OAuth2 server
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/**
 * Token exchange options
 */
export interface TokenExchangeOptions {
  subjectToken: string;
  subjectTokenType?: string;
}

/**
 * Fetch options for OAuth2 requests
 */
export interface OAuth2FetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
  tokenExchange?: TokenExchangeOptions;
  signer?: Signer;
}

/**
 * OAuth2 service interface
 */
export interface IOAuth2Service {
  fetch(provider: string, url: string, options?: OAuth2FetchOptions): Promise<Response>;
  getToken(provider: string, tokenExchange?: TokenExchangeOptions): Promise<string>;
  clearCache(provider?: string): void;
}
