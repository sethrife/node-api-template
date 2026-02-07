import { verifySignature } from '../../../src/middleware/http-signature/verify.js';
import type { FastifyRequest } from 'fastify';
import type { ParsedSignatureInput, ParsedSignature } from '../../../src/middleware/http-signature/types.js';
import '../../../src/middleware/http-signature/algorithms/rsa-pss-sha512.js';
import { getAlgorithm } from '../../../src/middleware/http-signature/algorithms/index.js';
import { generateKeyPair } from 'jose';
import { buildSignatureBase } from '../../../src/middleware/http-signature/signature-base.js';

function createMockRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    method: 'POST',
    url: '/api/data',
    headers: {
      'content-type': 'application/json',
    },
    hostname: 'example.com',
    protocol: 'https',
    ...overrides,
  } as FastifyRequest;
}

describe('verifySignature', () => {
  it('should verify a valid signature', async () => {
    const { publicKey, privateKey } = await generateKeyPair('PS512');
    const request = createMockRequest();

    const sigInput: ParsedSignatureInput = {
      label: 'sig1',
      components: ['@method', '@target-uri'],
      keyid: 'test-key',
      alg: 'rsa-pss-sha512',
      created: Math.floor(Date.now() / 1000),
    };

    // Create a real signature
    const algo = getAlgorithm('rsa-pss-sha512')!;
    const signatureBase = buildSignatureBase(request, sigInput);
    const signatureBytes = await algo.sign(privateKey, new TextEncoder().encode(signatureBase));

    const signature: ParsedSignature = {
      label: 'sig1',
      value: signatureBytes,
    };

    const mockResolver = {
      resolve: jest.fn().mockResolvedValue(publicKey),
    };

    const result = await verifySignature(request, sigInput, signature, mockResolver, {});

    expect(result.valid).toBe(true);
    expect(result.keyId).toBe('test-key');
  });

  it('should reject expired signature', async () => {
    const { publicKey, privateKey } = await generateKeyPair('PS512');
    const request = createMockRequest();

    const sigInput: ParsedSignatureInput = {
      label: 'sig1',
      components: ['@method'],
      keyid: 'test-key',
      alg: 'rsa-pss-sha512',
      created: Math.floor(Date.now() / 1000) - 600, // 10 minutes ago
    };

    const algo = getAlgorithm('rsa-pss-sha512')!;
    const signatureBase = buildSignatureBase(request, sigInput);
    const signatureBytes = await algo.sign(privateKey, new TextEncoder().encode(signatureBase));

    const signature: ParsedSignature = {
      label: 'sig1',
      value: signatureBytes,
    };

    const mockResolver = {
      resolve: jest.fn().mockResolvedValue(publicKey),
    };

    const result = await verifySignature(request, sigInput, signature, mockResolver, { maxAge: 300 });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('signature_expired');
  });

  it('should reject unknown algorithm', async () => {
    const request = createMockRequest();

    const sigInput: ParsedSignatureInput = {
      label: 'sig1',
      components: ['@method'],
      keyid: 'test-key',
      alg: 'unknown-algo',
    };

    const signature: ParsedSignature = {
      label: 'sig1',
      value: new Uint8Array([1, 2, 3]),
    };

    const mockResolver = {
      resolve: jest.fn(),
    };

    const result = await verifySignature(request, sigInput, signature, mockResolver, {});

    expect(result.valid).toBe(false);
    expect(result.error).toBe('unsupported_algorithm');
  });

  it('should reject algorithm not in allowlist', async () => {
    const request = createMockRequest();

    const sigInput: ParsedSignatureInput = {
      label: 'sig1',
      components: ['@method'],
      keyid: 'test-key',
      alg: 'rsa-pss-sha512',
    };

    const signature: ParsedSignature = {
      label: 'sig1',
      value: new Uint8Array([1, 2, 3]),
    };

    const mockResolver = {
      resolve: jest.fn(),
    };

    const result = await verifySignature(request, sigInput, signature, mockResolver, {
      algorithms: ['rsa-v1_5-sha256'], // Only allow this one
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('algorithm_not_allowed');
  });
});
