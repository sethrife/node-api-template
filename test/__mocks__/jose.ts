// Mock implementation of jose library for testing
import * as crypto from 'node:crypto';

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

// Re-export types for jose
export type CryptoKey = crypto.webcrypto.CryptoKey;
export type KeyObject = crypto.KeyObject;
export type KeyLike = crypto.KeyObject | crypto.webcrypto.CryptoKey;

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

// Generate key pairs for testing using promisified API
export async function generateKeyPair(alg: string): Promise<{ publicKey: crypto.KeyObject; privateKey: crypto.KeyObject }> {
  const { promisify } = await import('node:util');

  if (alg.startsWith('RS') || alg.startsWith('PS')) {
    const generateKeyPairAsync = promisify(crypto.generateKeyPair);
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    });
    return { publicKey, privateKey };
  } else if (alg.startsWith('ES')) {
    const generateKeyPairAsync = promisify(crypto.generateKeyPair);
    const namedCurve = alg === 'ES256' ? 'prime256v1' : alg === 'ES384' ? 'secp384r1' : 'secp521r1';
    const { publicKey, privateKey } = await generateKeyPairAsync('ec', {
      namedCurve,
    });
    return { publicKey, privateKey };
  } else {
    // Default to RSA for unknown algorithms
    const generateKeyPairAsync = promisify(crypto.generateKeyPair);
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
    });
    return { publicKey, privateKey };
  }
}

// Export a private key in PKCS8 PEM format
export async function exportPKCS8(key: crypto.KeyObject): Promise<string> {
  return key.export({ type: 'pkcs8', format: 'pem' }) as string;
}

// Import a private key from PKCS8 PEM format
export async function importPKCS8(pem: string, _alg: string): Promise<crypto.KeyObject> {
  return crypto.createPrivateKey(pem);
}
