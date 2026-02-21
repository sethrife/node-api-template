import { fetchClientCredentialsToken, tokenResponseToCachedToken } from '../../../src/services/oauth2/client-credentials.js';
import { OAuth2Error } from '../../../src/services/oauth2/errors.js';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('fetchClientCredentialsToken', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should fetch token successfully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'api:read',
      }),
    });

    const token = await fetchClientCredentialsToken(
      {
        tokenUrl: 'https://auth.example.com/token',
        clientId: 'my-client',
        clientSecret: 'my-secret',
        scope: 'api:read',
      },
      30
    );

    expect(token.accessToken).toBe('test-token');
    expect(token.scope).toBe('api:read');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://auth.example.com/token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    );
  });

  it('should throw OAuth2Error on 401', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Invalid credentials',
    });

    await expect(
      fetchClientCredentialsToken(
        {
          tokenUrl: 'https://auth.example.com/token',
          clientId: 'bad-client',
          clientSecret: 'bad-secret',
        },
        30
      )
    ).rejects.toThrow(OAuth2Error);
  });

  it('should include scope in request when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'token',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    });

    await fetchClientCredentialsToken(
      {
        tokenUrl: 'https://auth.example.com/token',
        clientId: 'client',
        clientSecret: 'secret',
        scope: 'read write',
      },
      30
    );

    const [, options] = mockFetch.mock.calls[0];
    expect(options.body).toContain('scope=read+write');
  });
});

describe('tokenResponseToCachedToken', () => {
  it('should calculate expiry times correctly', () => {
    const now = Date.now();
    const response = {
      access_token: 'token',
      token_type: 'Bearer',
      expires_in: 3600, // 1 hour
    };

    const cached = tokenResponseToCachedToken(response, 30);

    expect(cached.accessToken).toBe('token');
    // expiresAt should be ~1 hour from now
    expect(cached.expiresAt).toBeGreaterThan(now + 3500000);
    expect(cached.expiresAt).toBeLessThan(now + 3700000);
    // refreshAt should be at 75% (45 minutes)
    expect(cached.refreshAt).toBeGreaterThan(now + 2600000);
    expect(cached.refreshAt).toBeLessThan(now + 2800000);
  });

  it('should respect minimum refresh buffer', () => {
    const now = Date.now();
    const response = {
      access_token: 'token',
      token_type: 'Bearer',
      expires_in: 60, // Only 1 minute - 75% would be 45s, but buffer is 30s
    };

    const cached = tokenResponseToCachedToken(response, 30);

    // refreshAt should be at least 30s before expiry
    expect(cached.expiresAt - cached.refreshAt).toBeGreaterThanOrEqual(30000);
  });
});
