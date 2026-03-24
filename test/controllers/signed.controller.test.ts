import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';
import { generateKeyPair, exportPKCS8 } from 'jose';
import { createSigner } from '../../src/middleware/http-signature/sign.js';
import '../../src/middleware/http-signature/algorithms/rsa-pss-sha512.js';

// Mock config - must include all fields used by plugins
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

// Mock the JWKS key resolver so we can inject a test public key
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

// Mock the OAuth2Service so the real plugin runs (with fp) but fetch is a mock
jest.mock('../../src/services/oauth2/index.js', () => ({
  OAuth2Service: jest.fn().mockImplementation(() => ({
    fetch: jest.fn(),
    clearCache: jest.fn(),
  })),
}));

const configMock = jest.requireMock('../../src/config/index.js');

describe('SignedController', () => {
  let app: FastifyInstance;
  let publicKey: any;
  let privateKey: any;
  let pemPrivateKey: string;

  beforeAll(async () => {
    const keyPair = await generateKeyPair('PS512');
    publicKey = keyPair.publicKey;
    privateKey = keyPair.privateKey;
    pemPrivateKey = await exportPKCS8(privateKey);

    const jwksMock = await import('../../src/middleware/http-signature/jwks.js');
    (jwksMock as any).setMockPublicKey(publicKey);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();

    // Re-apply the public key after clearing mocks
    const jwksMock = await import('../../src/middleware/http-signature/jwks.js');
    (jwksMock as any).setMockPublicKey(publicKey);
  });

  afterEach(async () => {
    await app.close();
  });

  async function signRequest(options: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    components: string[];
  }): Promise<Record<string, string>> {
    const signer = await createSigner({
      keyId: 'test-key',
      privateKey: pemPrivateKey,
      algorithm: 'rsa-pss-sha512',
      components: options.components,
    });

    return signer.sign({
      method: options.method,
      url: options.url,
      headers: options.headers ?? {},
      body: options.body,
    });
  }

  describe('GET /api/signed/secure', () => {
    it('returns 401 when no signature provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/signed/secure',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('signature_required');
    });

    it('returns 401 when signature header is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/signed/secure',
        headers: {
          'signature-input': 'sig1=("@method");keyid="test-key";alg="rsa-pss-sha512"',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('signature_required');
    });

    it('returns 401 when required components are missing from signature', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/signed/secure',
        headers: {
          'signature-input': 'sig1=("@method");keyid="test-key";alg="rsa-pss-sha512"',
          'signature': 'sig1=:dGVzdA==:',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('missing_components');
    });

    it('returns 200 with signature info when valid signature is provided', async () => {
      const signedHeaders = await signRequest({
        method: 'GET',
        url: 'http://localhost/api/signed/secure',
        components: ['@method', '@target-uri', '@authority'],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/signed/secure',
        headers: {
          host: 'localhost',
          'signature-input': signedHeaders['Signature-Input'],
          'signature': signedHeaders['Signature'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Request signature verified');
      expect(body.signature.keyId).toBe('test-key');
      expect(body.signature.algorithm).toBe('rsa-pss-sha512');
    });
  });

  describe('POST /api/signed/data', () => {
    it('returns 401 when no signature provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/signed/data',
        payload: { hello: 'world' },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('signature_required');
    });

    it('returns 401 when content-digest is missing from signature', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/signed/data',
        headers: {
          'signature-input': 'sig1=("@method" "@target-uri");keyid="test-key";alg="rsa-pss-sha512"',
          'signature': 'sig1=:dGVzdA==:',
          'content-type': 'application/json',
        },
        payload: { hello: 'world' },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('missing_components');
    });

    it('returns 200 with signature info and body when valid signature is provided', async () => {
      const requestBody = JSON.stringify({ hello: 'world' });
      const signedHeaders = await signRequest({
        method: 'POST',
        url: 'http://localhost/api/signed/data',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        components: ['@method', '@target-uri', 'content-digest', 'content-type'],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/signed/data',
        headers: {
          host: 'localhost',
          'content-type': 'application/json',
          'content-digest': signedHeaders['Content-Digest'],
          'signature-input': signedHeaders['Signature-Input'],
          'signature': signedHeaders['Signature'],
        },
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Signed request accepted');
      expect(body.signature.keyId).toBe('test-key');
      expect(body.receivedBody).toEqual({ hello: 'world' });
    });
  });

  describe('POST /api/signed/strict', () => {
    it('returns 401 when no signature provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/signed/strict',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('signature_required');
    });

    it('returns 200 when valid rsa-pss-sha512 signature is provided', async () => {
      const requestBody = JSON.stringify({ data: 'strict' });
      const date = new Date().toUTCString();
      const signedHeaders = await signRequest({
        method: 'POST',
        url: 'http://localhost/api/signed/strict',
        headers: {
          'Content-Type': 'application/json',
          'Date': date,
        },
        body: requestBody,
        components: ['@method', '@target-uri', 'content-digest', 'date'],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/signed/strict',
        headers: {
          host: 'localhost',
          'content-type': 'application/json',
          'date': date,
          'content-digest': signedHeaders['Content-Digest'],
          'signature-input': signedHeaders['Signature-Input'],
          'signature': signedHeaders['Signature'],
        },
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Strict signature requirements met');
      expect(body.signature.algorithm).toBe('rsa-pss-sha512');
    });
  });

  describe('POST /api/signed/proxy', () => {
    it('returns 503 when signing is not configured', async () => {
      configMock.config.httpSignature.privateKey = null;
      configMock.config.httpSignature.keyId = null;

      const response = await app.inject({
        method: 'POST',
        url: '/api/signed/proxy',
        payload: { targetUrl: 'https://example.com/api', payload: { test: true } },
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('signing_not_configured');
    });

    it('returns 200 when signing is configured and fetch succeeds', async () => {
      configMock.config.httpSignature.privateKey = pemPrivateKey;
      configMock.config.httpSignature.keyId = 'proxy-key';

      global.fetch = jest.fn().mockResolvedValueOnce({
        status: 200,
        text: async () => '{"ok":true}',
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/signed/proxy',
        payload: { targetUrl: 'https://example.com/api', payload: { test: true } },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Signed request sent successfully');
      expect(body.signedWith.keyId).toBe('proxy-key');
      expect(body.response.status).toBe(200);

      // Restore
      configMock.config.httpSignature.privateKey = null;
      configMock.config.httpSignature.keyId = null;
    });
  });

  describe('POST /api/signed/double-auth', () => {
    it('returns 401 when no signature provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/signed/double-auth',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('signature_required');
    });

    it('returns 200 when valid signature covering authorization is provided', async () => {
      const signedHeaders = await signRequest({
        method: 'POST',
        url: 'http://localhost/api/signed/double-auth',
        headers: { 'Authorization': 'Bearer some-token' },
        components: ['@method', '@target-uri', 'authorization'],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/signed/double-auth',
        headers: {
          host: 'localhost',
          'authorization': 'Bearer some-token',
          'signature-input': signedHeaders['Signature-Input'],
          'signature': signedHeaders['Signature'],
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Both JWT and HTTP signature verified');
      expect(body.httpSignature.keyId).toBe('test-key');
    });
  });

  describe('POST /api/signed/oauth2-proxy', () => {
    it('returns 200 when oauth2 fetch succeeds', async () => {
      (app as any).oauth2.fetch.mockResolvedValueOnce({
        status: 200,
        text: async () => '{"result":"ok"}',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/signed/oauth2-proxy',
        payload: { targetUrl: 'https://api.example.com/data' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('OAuth2 authenticated request successful');
      expect(body.response.status).toBe(200);
    });
  });

  describe('POST /api/signed/oauth2-exchange', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/signed/oauth2-exchange',
        payload: { targetUrl: 'https://api.example.com/data' },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('missing_token');
    });

    it('returns 200 when token exchange succeeds', async () => {
      (app as any).oauth2.fetch.mockResolvedValueOnce({
        status: 200,
        text: async () => '{"data":"exchanged"}',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/signed/oauth2-exchange',
        headers: { authorization: 'Bearer user-token' },
        payload: { targetUrl: 'https://api.example.com/data' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Token exchange request successful');
    });
  });
});
