import type { OAuth2ProviderConfig, CachedToken, TokenResponse, TokenExchangeOptions } from './types.js';
import { OAuth2Error } from './errors.js';
import { tokenResponseToCachedToken } from './client-credentials.js';

const DEFAULT_SUBJECT_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

/**
 * Exchange a subject token for a new access token (RFC 8693)
 */
export async function fetchTokenExchange(
  config: OAuth2ProviderConfig,
  exchangeOptions: TokenExchangeOptions,
  refreshBufferSeconds: number
): Promise<CachedToken> {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    subject_token: exchangeOptions.subjectToken,
    subject_token_type: exchangeOptions.subjectTokenType || DEFAULT_SUBJECT_TOKEN_TYPE,
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
      `Token exchange failed: ${errorText}`,
      response.status === 401 ? 'invalid_credentials' : 'token_fetch_failed',
      'unknown',
      response.status
    );
  }

  const data = (await response.json()) as TokenResponse;
  return tokenResponseToCachedToken(data, refreshBufferSeconds);
}
