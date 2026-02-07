import type { preHandlerHookHandler } from 'fastify';
import type { HttpSigOptions, HttpSignatureInfo } from './types.js';
import { config } from '../../config/index.js';
import { parseSignatureInput, parseSignature } from './parse.js';
import { verifySignature } from './verify.js';
import { createKeyResolver } from './jwks.js';

// Import types to augment FastifyRequest
import './http-signature-types.js';

// Import algorithms to register them
import './algorithms/rsa-pss-sha512.js';
import './algorithms/rsa-v1_5-sha256.js';

const DEFAULT_REQUIRED_COMPONENTS = ['@method', '@target-uri', '@authority'];

/**
 * HTTP Signature verification middleware factory
 */
export function httpSig(options: HttpSigOptions = {}): preHandlerHookHandler {
  const {
    required = DEFAULT_REQUIRED_COMPONENTS,
    jwksUrl = config.httpSignature.jwksUrl,
    maxAge = config.httpSignature.maxAge,
    algorithms,
  } = options;

  return async (request, reply) => {
    // Extract headers
    const signatureHeader = request.headers['signature'] as string | undefined;
    const signatureInputHeader = request.headers['signature-input'] as string | undefined;

    // Check for required headers
    if (!signatureHeader || !signatureInputHeader) {
      return sendChallenge(reply, 'signature_required', 'Request signature required', required);
    }

    // Parse headers
    const sigInputs = parseSignatureInput(signatureInputHeader);
    const signatures = parseSignature(signatureHeader);

    if (sigInputs.length === 0 || signatures.length === 0) {
      return sendChallenge(reply, 'invalid_signature', 'Invalid signature format', required);
    }

    // Find matching signature input and signature
    const sigInput = sigInputs[0];
    const signature = signatures.find((s) => s.label === sigInput.label);

    if (!signature) {
      return sendChallenge(reply, 'invalid_signature', 'Signature label mismatch', required);
    }

    // Check required components are covered
    const missingComponents = required.filter((c) => !sigInput.components.includes(c));
    if (missingComponents.length > 0) {
      return sendChallenge(
        reply,
        'missing_components',
        `Signature must cover: ${missingComponents.join(', ')}`,
        required,
        missingComponents
      );
    }

    // Get key resolver
    if (!jwksUrl) {
      return reply.code(500).send({
        error: 'configuration_error',
        message: 'HTTP_SIG_JWKS_URL not configured',
      });
    }

    const keyResolver = createKeyResolver(jwksUrl);

    // Verify signature
    const result = await verifySignature(request, sigInput, signature, keyResolver, {
      maxAge,
      algorithms,
    });

    if (!result.valid) {
      const errorMessages: Record<string, string> = {
        unsupported_algorithm: 'Unsupported signature algorithm',
        algorithm_not_allowed: 'Signature algorithm not allowed',
        signature_expired: 'Signature has expired',
        signature_future: 'Signature timestamp is in the future',
        key_not_found: 'Signing key not found',
        invalid_signature: 'Signature verification failed',
        verification_failed: 'Signature verification failed',
      };

      return sendChallenge(
        reply,
        result.error ?? 'invalid_signature',
        errorMessages[result.error ?? 'invalid_signature'] ?? 'Signature verification failed',
        required
      );
    }

    // Attach signature info to request
    request.httpSignature = {
      keyId: result.keyId!,
      algorithm: result.algorithm!,
      components: result.components!,
      created: result.created,
    };
  };
}

function sendChallenge(
  reply: any,
  error: string,
  message: string,
  requiredHeaders: string[],
  missingHeaders?: string[]
) {
  let challenge = `Signature realm="api"`;

  if (error !== 'signature_required') {
    challenge += `, error="${error}"`;
  }

  if (missingHeaders && missingHeaders.length > 0) {
    challenge += `, headers="${missingHeaders.join(' ')}"`;
  } else if (error === 'signature_required') {
    challenge += `, headers="${requiredHeaders.join(' ')}"`;
  }

  return reply
    .header('WWW-Authenticate', challenge)
    .code(401)
    .send({ error, message });
}

// Re-export types and utilities
export type { HttpSigOptions, HttpSignatureInfo } from './types.js';
export { createSigner } from './sign.js';
