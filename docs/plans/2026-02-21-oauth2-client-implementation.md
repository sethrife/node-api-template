# OAuth2 Client Implementation Plan

**Goal:** Add OAuth2 client plugin for calling protected external APIs with automatic token management.

**Architecture:** Fastify plugin with OAuth2Service, in-memory token cache, support for client credentials and token exchange flows.

**Tech Stack:** TypeScript, Fastify 5, native fetch, Jest for testing

---

## Task 1: Types and Interfaces

**Files:**
- Create: `src/services/oauth2/types.ts`

```typescript
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
export interface OAuth2Service {
  fetch(provider: string, url: string, options?: OAuth2FetchOptions): Promise<Response>;
  getToken(provider: string, tokenExchange?: TokenExchangeOptions): Promise<string>;
  clearCache(provider?: string): void;
}
```

---

## Task 2: OAuth2 Error Class

**Files:**
- Create: `src/services/oauth2/errors.ts`
- Test: `test/services/oauth2/errors.test.ts`

```typescript
export class OAuth2Error extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'OAuth2Error';
  }
}
```

---

## Task 3: Token Cache

**Files:**
- Create: `src/services/oauth2/token-cache.ts`
- Test: `test/services/oauth2/token-cache.test.ts`

```typescript
import type { CachedToken } from './types.js';

export class TokenCache {
  private cache = new Map<string, CachedToken>();
  private refreshPromises = new Map<string, Promise<CachedToken>>();

  buildKey(provider: string, flow: string, subject?: string): string;
  get(key: string): CachedToken | undefined;
  set(key: string, token: CachedToken): void;
  delete(key: string): void;
  clear(provider?: string): void;
  needsRefresh(token: CachedToken): boolean;
  isExpired(token: CachedToken): boolean;
  getRefreshPromise(key: string): Promise<CachedToken> | undefined;
  setRefreshPromise(key: string, promise: Promise<CachedToken>): void;
  clearRefreshPromise(key: string): void;
}
```

---

## Task 4: Client Credentials Flow

**Files:**
- Create: `src/services/oauth2/client-credentials.ts`
- Test: `test/services/oauth2/client-credentials.test.ts`

```typescript
import type { OAuth2ProviderConfig, CachedToken } from './types.js';

export async function fetchClientCredentialsToken(
  config: OAuth2ProviderConfig,
  refreshBufferSeconds: number
): Promise<CachedToken>;
```

---

## Task 5: Token Exchange Flow

**Files:**
- Create: `src/services/oauth2/token-exchange.ts`
- Test: `test/services/oauth2/token-exchange.test.ts`

```typescript
import type { OAuth2ProviderConfig, CachedToken, TokenExchangeOptions } from './types.js';

export async function fetchTokenExchange(
  config: OAuth2ProviderConfig,
  exchangeOptions: TokenExchangeOptions,
  refreshBufferSeconds: number
): Promise<CachedToken>;
```

---

## Task 6: OAuth2 Service

**Files:**
- Create: `src/services/oauth2/index.ts`
- Test: `test/services/oauth2/oauth2-service.test.ts`

The main service class that:
- Manages token cache
- Fetches tokens via appropriate flow
- Makes authenticated requests
- Handles token refresh and retry on 401
- Optionally signs requests with HTTP signature

---

## Task 7: Configuration

**Files:**
- Modify: `src/config/index.ts`

Add OAuth2Config interface and oauth2 config section with provider discovery from environment variables.

---

## Task 8: Fastify Plugin

**Files:**
- Create: `src/plugins/oauth2.plugin.ts`
- Create: `src/types/fastify.d.ts` update for oauth2 decoration
- Test: `test/plugins/oauth2.plugin.test.ts`

Plugin that:
- Creates OAuth2Service instance
- Decorates fastify with `oauth2`
- Cleans up cache on close

---

## Task 9: Integration Test

**Files:**
- Create: `test/services/oauth2/integration.test.ts`

End-to-end tests:
- Client credentials flow with mocked token endpoint
- Token exchange flow
- Combined with HTTP signature
- Token refresh behavior
- 401 retry behavior

---

## Task 10: Final Verification

- Run all tests
- Build project
- Verify no TypeScript errors
