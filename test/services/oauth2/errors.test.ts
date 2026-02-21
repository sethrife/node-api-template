import { OAuth2Error } from '../../../src/services/oauth2/errors.js';

describe('OAuth2Error', () => {
  it('should create error with all properties', () => {
    const error = new OAuth2Error('Token fetch failed', 'token_fetch_failed', 'partner', 401);

    expect(error.message).toBe('Token fetch failed');
    expect(error.code).toBe('token_fetch_failed');
    expect(error.provider).toBe('partner');
    expect(error.statusCode).toBe(401);
    expect(error.name).toBe('OAuth2Error');
  });

  it('should work without statusCode', () => {
    const error = new OAuth2Error('Provider not found', 'provider_not_found', 'unknown');

    expect(error.statusCode).toBeUndefined();
  });

  it('should be instanceof Error', () => {
    const error = new OAuth2Error('Test', 'test', 'test');

    expect(error instanceof Error).toBe(true);
    expect(error instanceof OAuth2Error).toBe(true);
  });
});
