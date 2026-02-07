import type { ParsedSignatureInput, ParsedSignature } from './types.js';

/**
 * Parse the Signature-Input header
 */
export function parseSignatureInput(header: string): ParsedSignatureInput[] {
  const results: ParsedSignatureInput[] = [];

  // Split by comma for multiple signatures (but not commas inside quotes)
  const signatures = splitSignatures(header);

  for (const sig of signatures) {
    try {
      const parsed = parseSingleSignatureInput(sig.trim());
      if (parsed) {
        results.push(parsed);
      }
    } catch {
      // Skip invalid signatures
    }
  }

  return results;
}

function splitSignatures(header: string): string[] {
  const results: string[] = [];
  let current = '';
  let inParens = 0;
  let inQuotes = false;

  for (let i = 0; i < header.length; i++) {
    const char = header[i];

    if (char === '"' && header[i - 1] !== '\\') {
      inQuotes = !inQuotes;
    } else if (char === '(' && !inQuotes) {
      inParens++;
    } else if (char === ')' && !inQuotes) {
      inParens--;
    } else if (char === ',' && !inQuotes && inParens === 0) {
      results.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (current) {
    results.push(current);
  }

  return results;
}

function parseSingleSignatureInput(input: string): ParsedSignatureInput | null {
  // Format: label=("comp1" "comp2");keyid="xxx";alg="yyy";created=123
  const labelMatch = input.match(/^([a-zA-Z][a-zA-Z0-9_-]*)=\(([^)]*)\)/);
  if (!labelMatch) {
    return null;
  }

  const label = labelMatch[1];
  const componentsStr = labelMatch[2];
  const components = componentsStr.match(/"([^"]+)"/g)?.map((c) => c.slice(1, -1)) ?? [];

  const params = input.substring(labelMatch[0].length);

  const keyidMatch = params.match(/;keyid="([^"]+)"/);
  const algMatch = params.match(/;alg="([^"]+)"/);
  const createdMatch = params.match(/;created=(\d+)/);
  const expiresMatch = params.match(/;expires=(\d+)/);
  const nonceMatch = params.match(/;nonce="([^"]+)"/);

  if (!keyidMatch || !algMatch) {
    return null;
  }

  return {
    label,
    components,
    keyid: keyidMatch[1],
    alg: algMatch[1],
    created: createdMatch ? parseInt(createdMatch[1], 10) : undefined,
    expires: expiresMatch ? parseInt(expiresMatch[1], 10) : undefined,
    nonce: nonceMatch ? nonceMatch[1] : undefined,
  };
}

/**
 * Parse the Signature header
 */
export function parseSignature(header: string): ParsedSignature[] {
  const results: ParsedSignature[] = [];

  // Format: label=:base64:, label2=:base64:
  const regex = /([a-zA-Z][a-zA-Z0-9_-]*)=:([A-Za-z0-9+/=]+):/g;
  let match;

  while ((match = regex.exec(header)) !== null) {
    try {
      const value = base64ToUint8Array(match[2]);
      results.push({
        label: match[1],
        value,
      });
    } catch {
      // Skip invalid base64
    }
  }

  return results;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
