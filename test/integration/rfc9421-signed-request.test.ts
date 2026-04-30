/**
 * Integration test: receiving an RFC 9421 signed request.
 *
 * Demonstrates the minimal setup needed to test an endpoint protected by
 * httpSig() middleware using a real RSA-PSS key pair and the createSigner
 * helper. Uses the existing SignedController routes as the test target.
 *
 * Key steps:
 *   1. Generate a real RSA-PSS key pair in beforeAll
 *   2. Mock the JWKS resolver to return the public key
 *   3. Sign request headers with createSigner (produces Signature-Input + Signature)
 *   4. Inject the signed request via app.inject and assert the response
 */
import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';
import { generateKeyPair, exportPKCS8 } from 'jose';
import { createSigner } from '../../src/middleware/http-signature/sign.js';
import '../../src/middleware/http-signature/algorithms/rsa-pss-sha512.js';

jest.mock('../../src/config/index.js', () => ({
  config: {
    server: { port: 3000, host: '0.0.0.0' },
    jwt: { jwksUrl: 'https://test.example.com/.well-known/jwks.json' },
    httpSignature: {
      jwksUrl: 'https://example.com/.well-known/jwks.json',
      privateKey: null,
      keyId: null,
      defaultAlgorithm: 'rsa-pss-sha512',
      maxAge: 300,
    },
    oauth2: { providers: {}, refreshBufferSeconds: 30 },
    redis: {
      host: 'localhost',
      port: 6379,
      password: undefined,
      database: 0,
      tls: false,
      rejectUnauthorized: true,
      ca: undefined,
      cert: undefined,
      key: undefined,
    },
    mssql: {
      server: 'localhost',
      port: 1433,
      database: 'master',
      user: 'sa',
      password: '',
      options: {
        encrypt: false,
        trustServerCertificate: false,
        enableArithAbort: true,
        connectTimeout: 30000,
        requestTimeout: 30000,
      },
      pool: { max: 4, min: 2, idleTimeoutMillis: 30000 },
      connectionTimeout: 30000,
    },
  },
  validateConfig: jest.fn(),
}));

// Replace the JWKS resolver with a controllable in-memory store.
// createKeyResolver() returns a resolver whose resolve() yields whatever
// key was last passed to setMockPublicKey().
jest.mock('../../src/middleware/http-signature/jwks.js', () => {
  let mockPublicKey: any = null;
  return {
    createKeyResolver: jest.fn(() => ({
      resolve: jest.fn(async () => mockPublicKey),
    })),
    setMockPublicKey: (key: any) => {
      mockPublicKey = key;
    },
  };
});

jest.mock('../../src/services/oauth2/index.js', () => ({
  OAuth2Service: jest.fn().mockImplementation(() => ({
    fetch: jest.fn(),
    clearCache: jest.fn(),
  })),
}));

describe('RFC 9421 signed request – integration', () => {
  let app: FastifyInstance;
  let publicKey: any;
  let privateKeyPem: string;

  beforeAll(async () => {
    // Generate a one-time RSA-PSS key pair shared across all tests.
    const keyPair = await generateKeyPair('PS512');
    publicKey = keyPair.publicKey;
    privateKeyPem = await exportPKCS8(keyPair.privateKey);

    // Inject the public key so the JWKS resolver can verify signatures.
    const jwksMock = await import('../../src/middleware/http-signature/jwks.js');
    (jwksMock as any).setMockPublicKey(publicKey);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();

    // Re-apply the same public key after clearAllMocks resets mock state.
    const jwksMock = await import('../../src/middleware/http-signature/jwks.js');
    (jwksMock as any).setMockPublicKey(publicKey);
  });

  afterEach(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Unsigned request – middleware rejects before the handler runs
  // ---------------------------------------------------------------------------
  it('returns 401 when no Signature / Signature-Input headers are present', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/signed/secure',
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toBe('signature_required');
  });

  // ---------------------------------------------------------------------------
  // Signed GET request – happy path
  // ---------------------------------------------------------------------------
  it('returns 200 when a valid RFC 9421 signature covers the required components', async () => {
    // createSigner produces Signature-Input and Signature headers for the
    // given request method, URL, and component list.
    const signer = await createSigner({
      keyId: 'integration-key',
      privateKey: privateKeyPem,
      algorithm: 'rsa-pss-sha512',
      components: ['@method', '@target-uri', '@authority'],
    });

    const signedHeaders = await signer.sign({
      method: 'GET',
      url: 'http://localhost/api/signed/secure',
      headers: { host: 'localhost' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/signed/secure',
      headers: {
        host: 'localhost',
        'signature-input': signedHeaders['Signature-Input'],
        signature: signedHeaders['Signature'],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Request signature verified');
    expect(body.signature.keyId).toBe('integration-key');
    expect(body.signature.algorithm).toBe('rsa-pss-sha512');
  });

  // ---------------------------------------------------------------------------
  // Signed POST request with body integrity (content-digest)
  // ---------------------------------------------------------------------------
  it('returns 200 when a valid signature covers the request body via content-digest', async () => {
    const requestBody = JSON.stringify({ name: 'Alice', role: 'admin' });

    const signer = await createSigner({
      keyId: 'integration-key',
      privateKey: privateKeyPem,
      algorithm: 'rsa-pss-sha512',
      components: ['@method', '@target-uri', 'content-digest', 'content-type'],
    });

    const signedHeaders = await signer.sign({
      method: 'POST',
      url: 'http://localhost/api/signed/data',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/signed/data',
      headers: {
        host: 'localhost',
        'content-type': 'application/json',
        'content-digest': signedHeaders['Content-Digest'],
        'signature-input': signedHeaders['Signature-Input'],
        signature: signedHeaders['Signature'],
      },
      payload: requestBody,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Signed request accepted');
    expect(body.signature.keyId).toBe('integration-key');
    expect(body.receivedBody).toEqual({ name: 'Alice', role: 'admin' });
  });
});
