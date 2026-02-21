# OAuth2 Client Plugin Design

## Overview

Add support for calling external APIs protected by OAuth2 JWT authentication. The plugin handles token acquisition, caching, and automatic refresh.

## Use Cases

- **Client Credentials:** Service-to-service authentication (no user context)
- **Token Exchange:** Exchange incoming user token for downstream service token

## Architecture

```
src/
├── plugins/
│   └── oauth2.plugin.ts          # Fastify plugin, decorates with oauth2
├── services/
│   └── oauth2/
│       ├── index.ts              # OAuth2Service class
│       ├── types.ts              # TypeScript interfaces
│       ├── token-cache.ts        # In-memory token cache
│       ├── client-credentials.ts # Client credentials flow
│       └── token-exchange.ts     # Token exchange flow
```

### Design Decisions

- **Fastify plugin** following existing patterns (mssql, redis)
- **In-memory token cache** for simplicity (not shared across instances)
- **Multiple named providers** configured via environment variables
- **Proactive token refresh** at 75% of lifetime to avoid request failures
- **Optional HTTP signature integration** for APIs requiring both

## Public API

### Basic Usage (Client Credentials)

```typescript
// In a controller or route handler
const data = await fastify.oauth2.fetch('partner', 'https://api.partner.com/users');

// POST with body
const result = await fastify.oauth2.fetch('partner', 'https://api.partner.com/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'John' }),
});
```

### Token Exchange

```typescript
// Exchange current user's token for downstream token
const data = await fastify.oauth2.fetch('partner', 'https://api.partner.com/user-data', {
  tokenExchange: {
    subjectToken: request.headers.authorization?.replace('Bearer ', ''),
  },
});
```

### Combined with HTTP Signature

```typescript
import { createSigner } from '@/middleware/http-signature';

const signer = await createSigner({
  keyId: 'my-key',
  privateKey: process.env.HTTP_SIG_PRIVATE_KEY,
  algorithm: 'rsa-pss-sha512',
  components: ['@method', '@target-uri', 'content-digest'],
});

const data = await fastify.oauth2.fetch('partner', 'https://api.partner.com/secure', {
  method: 'POST',
  body: JSON.stringify(payload),
  signer,  // Adds HTTP signature headers + OAuth2 token
});
```

## Token Cache

### Storage Structure

```typescript
interface CachedToken {
  accessToken: string;
  expiresAt: number;      // Unix timestamp
  refreshAt: number;      // When to proactively refresh (75% of lifetime)
  scope?: string;
}
```

### Cache Keys

Tokens cached by provider + flow type + subject:
- `"partner:client_credentials"`
- `"partner:token_exchange:user-123"`

### Refresh Strategy

1. On each request, check if `Date.now() > refreshAt`
2. If yes, fetch new token in background (non-blocking)
3. Use current token for this request (still valid)
4. Next request uses the refreshed token

### Edge Cases

- Token fully expired: Block and fetch new token
- Refresh fails: Keep using current token until expiry
- Token fetch fails: Throw error (no silent fallback)

### Default Timing

- Refresh at 75% of token lifetime
- Minimum 30 seconds before expiry

## Configuration

### Environment Variables

```bash
# Partner API OAuth2 provider
OAUTH2_PARTNER_TOKEN_URL=https://partner.com/oauth/token
OAUTH2_PARTNER_CLIENT_ID=my-service
OAUTH2_PARTNER_CLIENT_SECRET=secret123
OAUTH2_PARTNER_SCOPE=api:read api:write

# Internal service OAuth2 provider
OAUTH2_INTERNAL_TOKEN_URL=https://auth.internal.com/token
OAUTH2_INTERNAL_CLIENT_ID=my-service
OAUTH2_INTERNAL_CLIENT_SECRET=internal-secret
OAUTH2_INTERNAL_SCOPE=service:call
```

### Config Integration

```typescript
// Added to src/config/index.ts
interface OAuth2ProviderConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
}

interface OAuth2Config {
  providers: Record<string, OAuth2ProviderConfig>;
  refreshBufferSeconds: number;  // Default: 30
}
```

### Provider Discovery

- Scan environment for `OAUTH2_*_TOKEN_URL` patterns
- Extract provider name from variable (e.g., `PARTNER` from `OAUTH2_PARTNER_TOKEN_URL`)
- Automatically register all found providers

## Error Handling

### Custom Error Type

```typescript
class OAuth2Error extends Error {
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

### Error Scenarios

| Scenario | Error Code | Behavior |
|----------|------------|----------|
| Provider not configured | `provider_not_found` | Throw immediately |
| Token endpoint unreachable | `token_fetch_failed` | Throw, no retry |
| Invalid credentials (401) | `invalid_credentials` | Throw, no retry |
| Token expired mid-request | `token_expired` | Fetch new token, retry once |
| Downstream API returns 401 | `unauthorized` | Refresh token, retry once |
| Downstream API returns 5xx | `upstream_error` | Throw, let caller handle |

### Logging

- Token fetches: `info` level (without secrets)
- Refresh events: `debug` level
- Errors: `warn` level with provider name and error code

## Testing Strategy

### Test Structure

```
test/
├── services/
│   └── oauth2/
│       ├── token-cache.test.ts
│       ├── client-credentials.test.ts
│       ├── token-exchange.test.ts
│       └── oauth2-service.test.ts
├── plugins/
│   └── oauth2.plugin.test.ts
```

### Key Test Scenarios

**Token Cache:**
- Store and retrieve tokens
- Proactive refresh triggers at 75% lifetime
- Expired tokens removed from cache
- Cache key isolation by provider/flow/subject

**Client Credentials:**
- Successful token fetch
- Handles error responses
- Caches token on success

**Token Exchange:**
- Exchanges subject token correctly
- Passes required grant_type parameters
- Handles exchange errors

**Integration:**
- Fetch with automatic token attachment
- Retry on 401 with refreshed token
- Combined with HTTP signature
