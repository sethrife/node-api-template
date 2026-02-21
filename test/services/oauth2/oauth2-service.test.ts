import { OAuth2Service, OAuth2Error } from '../../../src/services/oauth2/index.js';
import type { OAuth2ProviderConfig } from '../../../src/services/oauth2/types.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as any;

const testProviders: Record<string, OAuth2ProviderConfig> = {
  partner: {
    tokenUrl: 'https://partner.com/oauth/token',
    clientId: 'test-client',
    clientSecret: 'test-secret',
    scope: 'api:read',
  },
};

describe('OAuth2Service', () => {
  let service: OAuth2Service;

  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    service = new OAuth2Service(testProviders, mockLogger, 30);
  });

  describe('getToken', () => {
    it('should fetch and return token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const token = await service.getToken('partner');

      expect(token).toBe('test-token');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return cached token on second call', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      await service.getToken('partner');
      const token = await service.getToken('partner');

      expect(token).toBe('test-token');
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only one fetch
    });

    it('should throw for unknown provider', async () => {
      await expect(service.getToken('unknown')).rejects.toThrow(OAuth2Error);
      await expect(service.getToken('unknown')).rejects.toMatchObject({
        code: 'provider_not_found',
      });
    });
  });

  describe('fetch', () => {
    it('should make authenticated request', async () => {
      // Token fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'my-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      // API request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const response = await service.fetch('partner', 'https://api.partner.com/data');

      expect(response.status).toBe(200);

      // Check the API call had Authorization header
      const apiCall = mockFetch.mock.calls[1];
      expect(apiCall[1].headers.Authorization).toBe('Bearer my-token');
    });

    it('should retry on 401 with fresh token', async () => {
      // Initial token fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'old-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      // First API request returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      // Refresh token fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      // Retry API request succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const response = await service.fetch('partner', 'https://api.partner.com/data');

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(4);

      // Check retry used new token
      const retryCall = mockFetch.mock.calls[3];
      expect(retryCall[1].headers.Authorization).toBe('Bearer new-token');
    });
  });

  describe('fetch with token exchange', () => {
    it('should use token exchange flow', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'exchanged-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await service.fetch('partner', 'https://api.partner.com/user-data', {
        tokenExchange: { subjectToken: 'user-jwt' },
      });

      // Check token exchange grant type was used
      const tokenCall = mockFetch.mock.calls[0];
      expect(tokenCall[1].body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange');
    });
  });

  describe('clearCache', () => {
    it('should clear all cached tokens', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      await service.getToken('partner');
      service.clearCache();
      await service.getToken('partner');

      // Should have fetched twice
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
