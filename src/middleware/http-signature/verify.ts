import type { FastifyRequest } from 'fastify';
import type { ParsedSignatureInput, ParsedSignature, HttpSigOptions } from './types.js';
import type { KeyResolver } from './jwks.js';
import { getAlgorithm } from './algorithms/index.js';
import { buildSignatureBase } from './signature-base.js';

export interface VerificationResult {
  valid: boolean;
  keyId?: string;
  algorithm?: string;
  components?: string[];
  created?: number;
  error?: string;
}

export class VerificationError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'VerificationError';
  }
}

export async function verifySignature(
  request: FastifyRequest,
  sigInput: ParsedSignatureInput,
  signature: ParsedSignature,
  keyResolver: KeyResolver,
  options: Partial<HttpSigOptions>
): Promise<VerificationResult> {
  const { maxAge = 300, algorithms } = options;

  // Check algorithm is supported
  const algo = getAlgorithm(sigInput.alg);
  if (!algo) {
    return {
      valid: false,
      error: 'unsupported_algorithm',
    };
  }

  // Check algorithm is in allowlist (if specified)
  if (algorithms && !algorithms.includes(sigInput.alg)) {
    return {
      valid: false,
      error: 'algorithm_not_allowed',
    };
  }

  // Check signature freshness
  if (sigInput.created !== undefined) {
    const now = Math.floor(Date.now() / 1000);
    const age = now - sigInput.created;
    if (age > maxAge) {
      return {
        valid: false,
        error: 'signature_expired',
      };
    }
    if (age < -60) {
      // Allow 60 seconds clock skew into the future
      return {
        valid: false,
        error: 'signature_future',
      };
    }
  }

  // Check signature expiration
  if (sigInput.expires !== undefined) {
    const now = Math.floor(Date.now() / 1000);
    if (now > sigInput.expires) {
      return {
        valid: false,
        error: 'signature_expired',
      };
    }
  }

  // Resolve the public key
  let publicKey;
  try {
    publicKey = await keyResolver.resolve(sigInput.keyid, sigInput.alg);
  } catch {
    return {
      valid: false,
      error: 'key_not_found',
    };
  }

  // Build the signature base and verify
  const signatureBase = buildSignatureBase(request, sigInput);
  const data = new TextEncoder().encode(signatureBase);

  try {
    const valid = await algo.verify(publicKey, signature.value, data);
    if (!valid) {
      return {
        valid: false,
        error: 'invalid_signature',
      };
    }
  } catch {
    return {
      valid: false,
      error: 'verification_failed',
    };
  }

  return {
    valid: true,
    keyId: sigInput.keyid,
    algorithm: sigInput.alg,
    components: sigInput.components,
    created: sigInput.created,
  };
}
