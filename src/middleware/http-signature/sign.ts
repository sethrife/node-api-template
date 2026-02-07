import * as crypto from 'node:crypto';
import type { KeyLike } from './types.js';
import { importPKCS8 } from 'jose';
import type { SignerOptions, SignRequestData, Signer } from './types.js';
import { getAlgorithm } from './algorithms/index.js';

/**
 * Create a signer for outgoing HTTP requests
 */
export async function createSigner(options: SignerOptions): Promise<Signer> {
  const { keyId, privateKey, algorithm, components } = options;

  // Import the private key if it's a string (PEM format)
  let key: KeyLike;
  if (typeof privateKey === 'string') {
    key = await importPKCS8(privateKey, mapToJoseAlgorithm(algorithm));
  } else {
    key = privateKey;
  }

  const algo = getAlgorithm(algorithm);
  if (!algo) {
    throw new Error(`Unsupported algorithm: ${algorithm}`);
  }

  return {
    async sign(request: SignRequestData): Promise<Record<string, string>> {
      const result: Record<string, string> = { ...request.headers };
      const created = Math.floor(Date.now() / 1000);

      // Compute Content-Digest if body is provided and content-digest is in components
      if (request.body && components.includes('content-digest')) {
        const digest = computeContentDigest(request.body);
        result['Content-Digest'] = digest;
      }

      // Build signature base
      const signatureBase = buildOutgoingSignatureBase(request, result, components, keyId, algorithm, created);

      // Sign
      const signatureBytes = await algo.sign(key, new TextEncoder().encode(signatureBase));
      const base64Sig = uint8ArrayToBase64(signatureBytes);

      // Build headers
      const componentsList = components.map((c) => `"${c}"`).join(' ');
      result['Signature-Input'] = `sig1=(${componentsList});keyid="${keyId}";alg="${algorithm}";created=${created}`;
      result['Signature'] = `sig1=:${base64Sig}:`;

      return result;
    },
  };
}

function buildOutgoingSignatureBase(
  request: SignRequestData,
  headers: Record<string, string>,
  components: string[],
  keyId: string,
  algorithm: string,
  created: number
): string {
  const lines: string[] = [];
  const url = new URL(request.url);

  for (const component of components) {
    let value: string | undefined;

    switch (component) {
      case '@method':
        value = request.method;
        break;
      case '@target-uri':
        value = request.url;
        break;
      case '@authority':
        value = url.host;
        break;
      case '@scheme':
        value = url.protocol.replace(':', '');
        break;
      case '@path':
        value = url.pathname;
        break;
      case '@query':
        value = url.search || '?';
        break;
      default:
        // Header lookup (case-insensitive)
        value = headers[component] ?? headers[component.toLowerCase()] ?? headers[capitalizeHeader(component)];
    }

    if (value !== undefined) {
      lines.push(`"${component}": ${value}`);
    }
  }

  // Add signature params
  const componentsList = components.map((c) => `"${c}"`).join(' ');
  lines.push(`"@signature-params": (${componentsList});keyid="${keyId}";alg="${algorithm}";created=${created}`);

  return lines.join('\n');
}

function computeContentDigest(body: string): string {
  const hash = crypto.createHash('sha256').update(body).digest('base64');
  return `sha-256=:${hash}:`;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function capitalizeHeader(header: string): string {
  return header
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-');
}

function mapToJoseAlgorithm(algorithm: string): string {
  switch (algorithm) {
    case 'rsa-pss-sha512':
      return 'PS512';
    case 'rsa-v1_5-sha256':
      return 'RS256';
    default:
      return algorithm.toUpperCase();
  }
}
