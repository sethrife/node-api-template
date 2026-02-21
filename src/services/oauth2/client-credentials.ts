import type { OAuth2ProviderConfig, CachedToken, TokenResponse } from './types.js';
import { OAuth2Error } from './errors.js';

/**
 * Fetch a token using OAuth2 client credentials grant
 */
export async function fetchClientCredentialsToken(
  config: OAuth2ProviderConfig,
  refreshBufferSeconds: number
): Promise<CachedToken> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  if (config.scope) {
    body.set('scope', config.scope);
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new OAuth2Error(
      `Token fetch failed: ${errorText}`,
      response.status === 401 ? 'invalid_credentials' : 'token_fetch_failed',
      'unknown', // Provider name added by caller
      response.status
    );
  }

  const data = (await response.json()) as TokenResponse;
  return tokenResponseToCachedToken(data, refreshBufferSeconds);
}

/**
 * Convert OAuth2 token response to cached token with expiry calculation
 */
export function tokenResponseToCachedToken(response: TokenResponse, refreshBufferSeconds: number): CachedToken {
  const now = Date.now();
  const expiresInMs = response.expires_in * 1000;
  const expiresAt = now + expiresInMs;

  // Refresh at 75% of lifetime, but at least refreshBufferSeconds before expiry
  const refreshAt = Math.min(
    now + expiresInMs * 0.75,
    expiresAt - refreshBufferSeconds * 1000
  );

  return {
    accessToken: response.access_token,
    expiresAt,
    refreshAt,
    scope: response.scope,
  };
}
