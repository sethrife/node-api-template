// Mock implementation of jose library for testing

export interface JWTPayload {
  sub?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  iss?: string;
  aud?: string | string[];
  scope?: string;
  scopes?: string[];
  [key: string]: any;
}

export const createRemoteJWKSet = jest.fn(() => {
  // Return a mock JWKS getter
  return jest.fn();
});

export const jwtVerify = jest.fn(async (token: string, getKey: any) => {
  // Mock implementation - just return a decoded payload
  return {
    payload: {
      sub: 'test-user-123',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      email: 'test@example.com',
      scope: 'read write',
    } as JWTPayload,
    protectedHeader: {
      alg: 'RS256',
      typ: 'JWT',
    },
  };
});
