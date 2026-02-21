import { fetchTokenExchange } from '../../../src/services/oauth2/token-exchange.js';
import { OAuth2Error } from '../../../src/services/oauth2/errors.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('fetchTokenExchange', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should exchange token successfully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'exchanged-token',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    });

    const token = await fetchTokenExchange(
      {
        tokenUrl: 'https://auth.example.com/token',
        clientId: 'my-client',
        clientSecret: 'my-secret',
      },
      { subjectToken: 'user-jwt-token' },
      30
    );

    expect(token.accessToken).toBe('exchanged-token');
  });

  it('should use correct grant type', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'token',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    });

    await fetchTokenExchange(
      {
        tokenUrl: 'https://auth.example.com/token',
        clientId: 'client',
        clientSecret: 'secret',
      },
      { subjectToken: 'subject' },
      30
    );

    const [, options] = mockFetch.mock.calls[0];
    expect(options.body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange');
    expect(options.body).toContain('subject_token=subject');
  });

  it('should use default subject token type', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'token',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    });

    await fetchTokenExchange(
      {
        tokenUrl: 'https://auth.example.com/token',
        clientId: 'client',
        clientSecret: 'secret',
      },
      { subjectToken: 'subject' },
      30
    );

    const [, options] = mockFetch.mock.calls[0];
    expect(options.body).toContain('subject_token_type=urn%3Aietf%3Aparams%3Aoauth%3Atoken-type%3Aaccess_token');
  });

  it('should use custom subject token type when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'token',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    });

    await fetchTokenExchange(
      {
        tokenUrl: 'https://auth.example.com/token',
        clientId: 'client',
        clientSecret: 'secret',
      },
      {
        subjectToken: 'subject',
        subjectTokenType: 'urn:ietf:params:oauth:token-type:id_token',
      },
      30
    );

    const [, options] = mockFetch.mock.calls[0];
    expect(options.body).toContain('subject_token_type=urn%3Aietf%3Aparams%3Aoauth%3Atoken-type%3Aid_token');
  });

  it('should throw OAuth2Error on failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Invalid subject token',
    });

    await expect(
      fetchTokenExchange(
        {
          tokenUrl: 'https://auth.example.com/token',
          clientId: 'client',
          clientSecret: 'secret',
        },
        { subjectToken: 'bad-token' },
        30
      )
    ).rejects.toThrow(OAuth2Error);
  });
});
