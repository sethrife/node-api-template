# JWT Authentication Middleware

JWT verification middleware using `jose` library with JWKS support and optional scope validation.

## Configuration

Set the required environment variable:

```bash
JWKS_URL=https://your-auth-provider.com/.well-known/jwks.json
```

Example JWKS URLs for common providers:
- Auth0: `https://YOUR_DOMAIN.auth0.com/.well-known/jwks.json`
- Okta: `https://YOUR_DOMAIN.okta.com/oauth2/default/v1/keys`
- Azure AD: `https://login.microsoftonline.com/YOUR_TENANT/discovery/v2.0/keys`

## Usage

### Import the middleware

```typescript
import { jwtAuth } from './middleware/jwt-auth';
```

### Basic authentication (no scope required)

```typescript
@Get('/profile', jwtAuth())
async getProfile(request: FastifyRequest, reply: FastifyReply) {
  // Access user data from JWT
  const userId = request.user.sub;
  const email = request.user.email;

  return reply.send({ userId, email });
}
```

### Single scope requirement

```typescript
@Get('/admin', jwtAuth('admin'))
async adminEndpoint(request: FastifyRequest, reply: FastifyReply) {
  // Only users with 'admin' scope can access
  return reply.send({ message: 'Admin access granted' });
}
```

### Multiple scopes requirement (ALL required)

```typescript
@Post('/users', jwtAuth(['users:write', 'admin']))
async createUser(request: FastifyRequest, reply: FastifyReply) {
  // User must have BOTH 'users:write' AND 'admin' scopes
  return reply.send({ created: true });
}
```

## Authentication Flow

1. Client sends request with JWT in Authorization header:
   ```
   Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

2. Middleware extracts and verifies the JWT:
   - Validates signature using JWKS public keys
   - Checks token expiration (`exp` claim)
   - Checks not-before time (`nbf` claim, if present)

3. If scope(s) specified, validates token contains required scope(s)

4. Attaches decoded JWT payload to `request.user`

5. Continues to route handler on success

## Error Responses

### 401 Unauthorized
Returned when:
- Authorization header is missing
- Token format is invalid (not "Bearer TOKEN")
- JWT signature is invalid
- Token is expired
- Token is malformed

Response:
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing token"
}
```

### 403 Forbidden
Returned when:
- JWT is valid but missing required scope(s)

Response:
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions"
}
```

## Scope Format

The middleware supports two scope formats in JWT:

### Space-separated string (OAuth 2.0 standard)
```json
{
  "scope": "read write admin"
}
```

### Array format
```json
{
  "scopes": ["read", "write", "admin"]
}
```

## Accessing User Data

After successful authentication, the full JWT payload is available in `request.user`:

```typescript
@Get('/me', jwtAuth())
async getMe(request: FastifyRequest, reply: FastifyReply) {
  return reply.send({
    userId: request.user.sub,           // Subject (user ID)
    email: request.user.email,          // Custom claim
    issuedAt: request.user.iat,         // Issued at timestamp
    expiresAt: request.user.exp,        // Expiration timestamp
    scopes: request.user.scope || request.user.scopes,  // User scopes
    // ... any other claims in the JWT
  });
}
```

## JWKS Caching

The `jose` library automatically:
- Fetches JWKS on first use (lazy loading)
- Caches keys in memory
- Respects Cache-Control headers
- Refetches when cache expires
- Handles key rotation transparently

No external cache (Redis, etc.) is needed for JWKS caching.

## Security Notes

- All authentication failures return generic error messages (no details about why verification failed)
- 401 vs 403 distinction helps clients understand whether to retry with different credentials
- JWKS_URL must be set or the application will fail to start (fail-fast pattern)
- Scope matching is case-sensitive
- Only validates signature and expiration by default (no issuer/audience validation)
