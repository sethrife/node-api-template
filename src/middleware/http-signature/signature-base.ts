import type { FastifyRequest } from 'fastify';
import type { ParsedSignatureInput } from './types.js';
import { extractComponent } from './components.js';

/**
 * Build the signature base string per RFC9421
 */
export function buildSignatureBase(request: FastifyRequest, sigInput: ParsedSignatureInput): string {
  const lines: string[] = [];

  // Add each component
  for (const component of sigInput.components) {
    const value = extractComponent(request, component);
    if (value !== undefined) {
      lines.push(`"${component}": ${value}`);
    }
  }

  // Add signature params as last line
  const sigParams = buildSignatureParams(sigInput);
  lines.push(`"@signature-params": ${sigParams}`);

  return lines.join('\n');
}

/**
 * Build the signature-params value
 */
export function buildSignatureParams(sigInput: ParsedSignatureInput): string {
  const componentsList = sigInput.components.map((c) => `"${c}"`).join(' ');
  let params = `(${componentsList})`;

  // Add required parameters
  params += `;keyid="${sigInput.keyid}"`;
  params += `;alg="${sigInput.alg}"`;

  // Add optional parameters
  if (sigInput.created !== undefined) {
    params += `;created=${sigInput.created}`;
  }
  if (sigInput.expires !== undefined) {
    params += `;expires=${sigInput.expires}`;
  }
  if (sigInput.nonce !== undefined) {
    params += `;nonce="${sigInput.nonce}"`;
  }

  return params;
}
