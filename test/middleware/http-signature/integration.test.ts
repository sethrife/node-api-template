import { generateKeyPair, exportPKCS8 } from 'jose';
import { createSigner } from '../../../src/middleware/http-signature/sign.js';
import { parseSignatureInput, parseSignature } from '../../../src/middleware/http-signature/parse.js';
import { verifySignature } from '../../../src/middleware/http-signature/verify.js';
import '../../../src/middleware/http-signature/algorithms/rsa-pss-sha512.js';

// Mock config
jest.mock('../../../src/config/index.js', () => ({
  config: {
    httpSignature: {
      jwksUrl: 'https://example.com/.well-known/jwks.json',
      maxAge: 300,
      defaultAlgorithm: 'rsa-pss-sha512',
    },
  },
}));

describe('HTTP Signature Integration', () => {
  let publicKey: any;
  let privateKey: any;
  let pemPrivateKey: string;

  beforeAll(async () => {
    const keyPair = await generateKeyPair('PS512');
    publicKey = keyPair.publicKey;
    privateKey = keyPair.privateKey;
    pemPrivateKey = await exportPKCS8(privateKey);
  });

  it('should sign a request and verify it round-trip', async () => {
    // Create signer
    const signer = await createSigner({
      keyId: 'test-key',
      privateKey: pemPrivateKey,
      algorithm: 'rsa-pss-sha512',
      components: ['@method', '@target-uri', 'content-type'],
    });

    // Sign a request
    const signedHeaders = await signer.sign({
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{"test": true}',
    });

    // Parse the signature
    const sigInputs = parseSignatureInput(signedHeaders['Signature-Input']);
    const signatures = parseSignature(signedHeaders['Signature']);

    expect(sigInputs).toHaveLength(1);
    expect(signatures).toHaveLength(1);

    // Verify the signature
    const mockRequest = {
      method: 'POST',
      url: '/data',
      headers: {
        'content-type': 'application/json',
        'signature': signedHeaders['Signature'],
        'signature-input': signedHeaders['Signature-Input'],
      },
      hostname: 'api.example.com',
      protocol: 'https',
    };

    const mockResolver = {
      resolve: jest.fn().mockResolvedValue(publicKey),
    };

    const result = await verifySignature(
      mockRequest as any,
      sigInputs[0],
      signatures[0],
      mockResolver,
      { maxAge: 300 }
    );

    expect(result.valid).toBe(true);
    expect(result.keyId).toBe('test-key');
    expect(result.algorithm).toBe('rsa-pss-sha512');
  });

  it('should reject tampered request', async () => {
    // Create signer
    const signer = await createSigner({
      keyId: 'test-key',
      privateKey: pemPrivateKey,
      algorithm: 'rsa-pss-sha512',
      components: ['@method', '@target-uri'],
    });

    // Sign a request
    const signedHeaders = await signer.sign({
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: {},
    });

    // Parse the signature
    const sigInputs = parseSignatureInput(signedHeaders['Signature-Input']);
    const signatures = parseSignature(signedHeaders['Signature']);

    // Tamper with the request (different URL)
    const tamperedRequest = {
      method: 'POST',
      url: '/tampered',
      headers: {
        'signature': signedHeaders['Signature'],
        'signature-input': signedHeaders['Signature-Input'],
      },
      hostname: 'api.example.com',
      protocol: 'https',
    };

    const mockResolver = {
      resolve: jest.fn().mockResolvedValue(publicKey),
    };

    const result = await verifySignature(
      tamperedRequest as any,
      sigInputs[0],
      signatures[0],
      mockResolver,
      { maxAge: 300 }
    );

    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid_signature');
  });
});
