# RFC9421 HTTP Message Signatures Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add RFC9421 HTTP Message Signatures support for verifying incoming requests and signing outgoing requests.

**Architecture:** Fastify middleware following existing `jwtAuth` patterns, using `jose` library for cryptographic operations, with pluggable algorithm registry for extensibility.

**Tech Stack:** TypeScript, Fastify 5, jose library, Jest for testing

---

## Task 1: Types and Interfaces

**Files:**
- Create: `src/middleware/http-signature/types.ts`
- Test: None (type definitions only)

**Step 1: Create types file**

```typescript
import type { KeyLike } from 'jose';

/**
 * Signature algorithm interface for pluggable algorithm support
 */
export interface SignatureAlgorithm {
  name: string;
  verify(publicKey: KeyLike, signature: Uint8Array, data: Uint8Array): Promise<boolean>;
  sign(privateKey: KeyLike, data: Uint8Array): Promise<Uint8Array>;
}

/**
 * Parsed signature input from Signature-Input header
 */
export interface ParsedSignatureInput {
  label: string;
  components: string[];
  keyid: string;
  alg: string;
  created?: number;
  expires?: number;
  nonce?: string;
}

/**
 * Parsed signature from Signature header
 */
export interface ParsedSignature {
  label: string;
  value: Uint8Array;
}

/**
 * Options for httpSig middleware
 */
export interface HttpSigOptions {
  /** Components that must be covered by the signature */
  required?: string[];
  /** JWKS URL for fetching public keys (overrides config) */
  jwksUrl?: string;
  /** Maximum age of signature in seconds (default: 300) */
  maxAge?: number;
  /** Allowed algorithms (default: all registered) */
  algorithms?: string[];
}

/**
 * Verified signature info attached to request
 */
export interface HttpSignatureInfo {
  keyId: string;
  algorithm: string;
  components: string[];
  created?: number;
}

/**
 * Options for creating a signer
 */
export interface SignerOptions {
  keyId: string;
  privateKey: string | KeyLike;
  algorithm: string;
  components: string[];
}

/**
 * Request data for signing
 */
export interface SignRequestData {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * Signer instance
 */
export interface Signer {
  sign(request: SignRequestData): Promise<Record<string, string>>;
}
```

**Step 2: Commit**

```bash
git add src/middleware/http-signature/types.ts
git commit -m "feat(http-sig): add TypeScript types and interfaces"
```

---

## Task 2: Algorithm Registry

**Files:**
- Create: `src/middleware/http-signature/algorithms/index.ts`
- Test: `test/middleware/http-signature/algorithms.test.ts`

**Step 1: Write the failing test**

```typescript
import { registerAlgorithm, getAlgorithm, getRegisteredAlgorithms } from '../../../src/middleware/http-signature/algorithms/index.js';

describe('algorithm registry', () => {
  it('should register and retrieve an algorithm', () => {
    const mockAlgo = {
      name: 'test-algo',
      verify: jest.fn(),
      sign: jest.fn(),
    };

    registerAlgorithm(mockAlgo);
    const retrieved = getAlgorithm('test-algo');

    expect(retrieved).toBe(mockAlgo);
  });

  it('should return undefined for unregistered algorithm', () => {
    const result = getAlgorithm('nonexistent-algo');
    expect(result).toBeUndefined();
  });

  it('should list all registered algorithms', () => {
    const algos = getRegisteredAlgorithms();
    expect(Array.isArray(algos)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/middleware/http-signature/algorithms.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
import type { SignatureAlgorithm } from '../types.js';

const registry = new Map<string, SignatureAlgorithm>();

export function registerAlgorithm(algo: SignatureAlgorithm): void {
  registry.set(algo.name, algo);
}

export function getAlgorithm(name: string): SignatureAlgorithm | undefined {
  return registry.get(name);
}

export function getRegisteredAlgorithms(): string[] {
  return Array.from(registry.keys());
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/middleware/http-signature/algorithms.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/middleware/http-signature/algorithms/index.ts test/middleware/http-signature/algorithms.test.ts
git commit -m "feat(http-sig): add algorithm registry"
```

---

## Task 3: RSA-PSS-SHA512 Algorithm

**Files:**
- Create: `src/middleware/http-signature/algorithms/rsa-pss-sha512.ts`
- Modify: `src/middleware/http-signature/algorithms/index.ts` (add import)
- Test: `test/middleware/http-signature/algorithms/rsa-pss-sha512.test.ts`

**Step 1: Write the failing test**

```typescript
import { generateKeyPair } from 'jose';
import '../../../src/middleware/http-signature/algorithms/rsa-pss-sha512.js';
import { getAlgorithm } from '../../../src/middleware/http-signature/algorithms/index.js';

describe('rsa-pss-sha512 algorithm', () => {
  it('should be registered', () => {
    const algo = getAlgorithm('rsa-pss-sha512');
    expect(algo).toBeDefined();
    expect(algo?.name).toBe('rsa-pss-sha512');
  });

  it('should sign and verify data', async () => {
    const { publicKey, privateKey } = await generateKeyPair('PS512');
    const algo = getAlgorithm('rsa-pss-sha512')!;
    const data = new TextEncoder().encode('test data to sign');

    const signature = await algo.sign(privateKey, data);
    const isValid = await algo.verify(publicKey, signature, data);

    expect(isValid).toBe(true);
  });

  it('should reject tampered data', async () => {
    const { publicKey, privateKey } = await generateKeyPair('PS512');
    const algo = getAlgorithm('rsa-pss-sha512')!;
    const data = new TextEncoder().encode('test data to sign');
    const tamperedData = new TextEncoder().encode('tampered data');

    const signature = await algo.sign(privateKey, data);
    const isValid = await algo.verify(publicKey, signature, tamperedData);

    expect(isValid).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/middleware/http-signature/algorithms/rsa-pss-sha512.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
import * as crypto from 'node:crypto';
import type { KeyLike } from 'jose';
import { registerAlgorithm } from './index.js';

registerAlgorithm({
  name: 'rsa-pss-sha512',

  async verify(publicKey: KeyLike, signature: Uint8Array, data: Uint8Array): Promise<boolean> {
    try {
      const verifier = crypto.createVerify('RSA-SHA512');
      verifier.update(data);
      return verifier.verify(
        {
          key: publicKey as crypto.KeyObject,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
        },
        signature
      );
    } catch {
      return false;
    }
  },

  async sign(privateKey: KeyLike, data: Uint8Array): Promise<Uint8Array> {
    const signer = crypto.createSign('RSA-SHA512');
    signer.update(data);
    return signer.sign({
      key: privateKey as crypto.KeyObject,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    });
  },
});
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/middleware/http-signature/algorithms/rsa-pss-sha512.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/middleware/http-signature/algorithms/rsa-pss-sha512.ts test/middleware/http-signature/algorithms/rsa-pss-sha512.test.ts
git commit -m "feat(http-sig): add rsa-pss-sha512 algorithm"
```

---

## Task 4: RSA-v1_5-SHA256 Algorithm

**Files:**
- Create: `src/middleware/http-signature/algorithms/rsa-v1_5-sha256.ts`
- Test: `test/middleware/http-signature/algorithms/rsa-v1_5-sha256.test.ts`

**Step 1: Write the failing test**

```typescript
import { generateKeyPair } from 'jose';
import '../../../src/middleware/http-signature/algorithms/rsa-v1_5-sha256.js';
import { getAlgorithm } from '../../../src/middleware/http-signature/algorithms/index.js';

describe('rsa-v1_5-sha256 algorithm', () => {
  it('should be registered', () => {
    const algo = getAlgorithm('rsa-v1_5-sha256');
    expect(algo).toBeDefined();
    expect(algo?.name).toBe('rsa-v1_5-sha256');
  });

  it('should sign and verify data', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const algo = getAlgorithm('rsa-v1_5-sha256')!;
    const data = new TextEncoder().encode('test data to sign');

    const signature = await algo.sign(privateKey, data);
    const isValid = await algo.verify(publicKey, signature, data);

    expect(isValid).toBe(true);
  });

  it('should reject tampered data', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const algo = getAlgorithm('rsa-v1_5-sha256')!;
    const data = new TextEncoder().encode('test data to sign');
    const tamperedData = new TextEncoder().encode('tampered data');

    const signature = await algo.sign(privateKey, data);
    const isValid = await algo.verify(publicKey, signature, tamperedData);

    expect(isValid).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/middleware/http-signature/algorithms/rsa-v1_5-sha256.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
import * as crypto from 'node:crypto';
import type { KeyLike } from 'jose';
import { registerAlgorithm } from './index.js';

registerAlgorithm({
  name: 'rsa-v1_5-sha256',

  async verify(publicKey: KeyLike, signature: Uint8Array, data: Uint8Array): Promise<boolean> {
    try {
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(data);
      return verifier.verify(publicKey as crypto.KeyObject, signature);
    } catch {
      return false;
    }
  },

  async sign(privateKey: KeyLike, data: Uint8Array): Promise<Uint8Array> {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(data);
    return signer.sign(privateKey as crypto.KeyObject);
  },
});
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/middleware/http-signature/algorithms/rsa-v1_5-sha256.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/middleware/http-signature/algorithms/rsa-v1_5-sha256.ts test/middleware/http-signature/algorithms/rsa-v1_5-sha256.test.ts
git commit -m "feat(http-sig): add rsa-v1_5-sha256 algorithm"
```

---

## Task 5: Component Extraction

**Files:**
- Create: `src/middleware/http-signature/components.ts`
- Test: `test/middleware/http-signature/components.test.ts`

**Step 1: Write the failing test**

```typescript
import { extractComponent } from '../../../src/middleware/http-signature/components.js';
import type { FastifyRequest } from 'fastify';

function createMockRequest(overrides: Partial<{
  method: string;
  url: string;
  headers: Record<string, string>;
  hostname: string;
  protocol: string;
}>): FastifyRequest {
  return {
    method: overrides.method ?? 'GET',
    url: overrides.url ?? '/api/data',
    headers: overrides.headers ?? {},
    hostname: overrides.hostname ?? 'example.com',
    protocol: overrides.protocol ?? 'https',
  } as FastifyRequest;
}

describe('extractComponent', () => {
  describe('derived components', () => {
    it('should extract @method', () => {
      const request = createMockRequest({ method: 'POST' });
      expect(extractComponent(request, '@method')).toBe('POST');
    });

    it('should extract @target-uri', () => {
      const request = createMockRequest({
        protocol: 'https',
        hostname: 'example.com',
        url: '/api/data?foo=bar',
      });
      expect(extractComponent(request, '@target-uri')).toBe('https://example.com/api/data?foo=bar');
    });

    it('should extract @authority', () => {
      const request = createMockRequest({ hostname: 'example.com' });
      expect(extractComponent(request, '@authority')).toBe('example.com');
    });

    it('should extract @scheme', () => {
      const request = createMockRequest({ protocol: 'https' });
      expect(extractComponent(request, '@scheme')).toBe('https');
    });

    it('should extract @path', () => {
      const request = createMockRequest({ url: '/api/data?foo=bar' });
      expect(extractComponent(request, '@path')).toBe('/api/data');
    });

    it('should extract @query', () => {
      const request = createMockRequest({ url: '/api/data?foo=bar&baz=qux' });
      expect(extractComponent(request, '@query')).toBe('?foo=bar&baz=qux');
    });

    it('should return empty @query when no query string', () => {
      const request = createMockRequest({ url: '/api/data' });
      expect(extractComponent(request, '@query')).toBe('?');
    });
  });

  describe('header components', () => {
    it('should extract header value (case-insensitive)', () => {
      const request = createMockRequest({
        headers: { 'Content-Type': 'application/json' },
      });
      expect(extractComponent(request, 'content-type')).toBe('application/json');
    });

    it('should return undefined for missing header', () => {
      const request = createMockRequest({ headers: {} });
      expect(extractComponent(request, 'content-type')).toBeUndefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/middleware/http-signature/components.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
import type { FastifyRequest } from 'fastify';

/**
 * Extract a component value from a request per RFC9421
 */
export function extractComponent(request: FastifyRequest, component: string): string | undefined {
  // Derived components start with @
  if (component.startsWith('@')) {
    return extractDerivedComponent(request, component);
  }

  // Regular headers (case-insensitive lookup)
  const headerValue = request.headers[component.toLowerCase()];
  if (Array.isArray(headerValue)) {
    return headerValue.join(', ');
  }
  return headerValue;
}

function extractDerivedComponent(request: FastifyRequest, component: string): string | undefined {
  switch (component) {
    case '@method':
      return request.method;

    case '@target-uri':
      return `${request.protocol}://${request.hostname}${request.url}`;

    case '@authority':
      return request.hostname;

    case '@scheme':
      return request.protocol;

    case '@path': {
      const url = request.url;
      const queryIndex = url.indexOf('?');
      return queryIndex >= 0 ? url.substring(0, queryIndex) : url;
    }

    case '@query': {
      const url = request.url;
      const queryIndex = url.indexOf('?');
      return queryIndex >= 0 ? url.substring(queryIndex) : '?';
    }

    default:
      return undefined;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/middleware/http-signature/components.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/middleware/http-signature/components.ts test/middleware/http-signature/components.test.ts
git commit -m "feat(http-sig): add component extraction for RFC9421"
```

---

## Task 6: Signature Base Construction

**Files:**
- Create: `src/middleware/http-signature/signature-base.ts`
- Test: `test/middleware/http-signature/signature-base.test.ts`

**Step 1: Write the failing test**

```typescript
import { buildSignatureBase } from '../../../src/middleware/http-signature/signature-base.js';
import type { FastifyRequest } from 'fastify';
import type { ParsedSignatureInput } from '../../../src/middleware/http-signature/types.js';

function createMockRequest(): FastifyRequest {
  return {
    method: 'POST',
    url: '/api/data',
    headers: {
      'content-type': 'application/json',
      'content-digest': 'sha-256=:X48E9qOokqqrvdts8nOJRJN3OWDUoyWxBf7kbu9DBPE=:',
    },
    hostname: 'example.com',
    protocol: 'https',
  } as FastifyRequest;
}

describe('buildSignatureBase', () => {
  it('should build signature base string per RFC9421', () => {
    const request = createMockRequest();
    const sigInput: ParsedSignatureInput = {
      label: 'sig1',
      components: ['@method', '@target-uri', 'content-digest'],
      keyid: 'client-key-1',
      alg: 'rsa-pss-sha512',
      created: 1704067200,
    };

    const base = buildSignatureBase(request, sigInput);

    expect(base).toContain('"@method": POST');
    expect(base).toContain('"@target-uri": https://example.com/api/data');
    expect(base).toContain('"content-digest": sha-256=:X48E9qOokqqrvdts8nOJRJN3OWDUoyWxBf7kbu9DBPE=:');
    expect(base).toContain('"@signature-params":');
  });

  it('should include signature-params as last line', () => {
    const request = createMockRequest();
    const sigInput: ParsedSignatureInput = {
      label: 'sig1',
      components: ['@method'],
      keyid: 'key1',
      alg: 'rsa-pss-sha512',
    };

    const base = buildSignatureBase(request, sigInput);
    const lines = base.split('\n');
    const lastLine = lines[lines.length - 1];

    expect(lastLine.startsWith('"@signature-params":')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/middleware/http-signature/signature-base.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/middleware/http-signature/signature-base.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/middleware/http-signature/signature-base.ts test/middleware/http-signature/signature-base.test.ts
git commit -m "feat(http-sig): add signature base string construction"
```

---

## Task 7: Header Parsing

**Files:**
- Create: `src/middleware/http-signature/parse.ts`
- Test: `test/middleware/http-signature/parse.test.ts`

**Step 1: Write the failing test**

```typescript
import { parseSignatureInput, parseSignature } from '../../../src/middleware/http-signature/parse.js';

describe('parseSignatureInput', () => {
  it('should parse a valid Signature-Input header', () => {
    const header = 'sig1=("@method" "@target-uri" "content-digest");keyid="client-key-1";alg="rsa-pss-sha512";created=1704067200';

    const result = parseSignatureInput(header);

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('sig1');
    expect(result[0].components).toEqual(['@method', '@target-uri', 'content-digest']);
    expect(result[0].keyid).toBe('client-key-1');
    expect(result[0].alg).toBe('rsa-pss-sha512');
    expect(result[0].created).toBe(1704067200);
  });

  it('should parse signature input without created timestamp', () => {
    const header = 'sig1=("@method");keyid="key1";alg="rsa-v1_5-sha256"';

    const result = parseSignatureInput(header);

    expect(result[0].created).toBeUndefined();
  });

  it('should parse multiple signatures', () => {
    const header = 'sig1=("@method");keyid="k1";alg="rsa-pss-sha512", sig2=("@path");keyid="k2";alg="rsa-v1_5-sha256"';

    const result = parseSignatureInput(header);

    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('sig1');
    expect(result[1].label).toBe('sig2');
  });

  it('should return empty array for invalid header', () => {
    const result = parseSignatureInput('invalid');
    expect(result).toEqual([]);
  });
});

describe('parseSignature', () => {
  it('should parse a valid Signature header', () => {
    const header = 'sig1=:dGVzdCBzaWduYXR1cmU=:';

    const result = parseSignature(header);

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('sig1');
    expect(result[0].value).toBeInstanceOf(Uint8Array);
  });

  it('should parse multiple signatures', () => {
    const header = 'sig1=:dGVzdDE=:, sig2=:dGVzdDI=:';

    const result = parseSignature(header);

    expect(result).toHaveLength(2);
  });

  it('should return empty array for invalid header', () => {
    const result = parseSignature('invalid');
    expect(result).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/middleware/http-signature/parse.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/middleware/http-signature/parse.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/middleware/http-signature/parse.ts test/middleware/http-signature/parse.test.ts
git commit -m "feat(http-sig): add Signature-Input and Signature header parsing"
```

---

## Task 8: JWKS Key Resolution

**Files:**
- Create: `src/middleware/http-signature/jwks.ts`
- Test: `test/middleware/http-signature/jwks.test.ts`

**Step 1: Write the failing test**

```typescript
import { createKeyResolver, KeyResolver } from '../../../src/middleware/http-signature/jwks.js';
import { createRemoteJWKSet } from 'jose';

// The jose mock is automatically loaded from test/__mocks__/jose.ts

describe('KeyResolver', () => {
  it('should create a resolver with JWKS URL', () => {
    const resolver = createKeyResolver('https://example.com/.well-known/jwks.json');
    expect(resolver).toBeDefined();
    expect(typeof resolver.resolve).toBe('function');
  });

  it('should call createRemoteJWKSet with correct URL', () => {
    const url = 'https://example.com/.well-known/jwks.json';
    createKeyResolver(url);

    expect(createRemoteJWKSet).toHaveBeenCalledWith(new URL(url));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/middleware/http-signature/jwks.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
import { createRemoteJWKSet, type KeyLike } from 'jose';

export interface KeyResolver {
  resolve(keyId: string, algorithm: string): Promise<KeyLike>;
}

/**
 * Create a key resolver that fetches keys from a JWKS endpoint
 */
export function createKeyResolver(jwksUrl: string): KeyResolver {
  const getKey = createRemoteJWKSet(new URL(jwksUrl));

  return {
    async resolve(keyId: string, algorithm: string): Promise<KeyLike> {
      // Map our algorithm names to JOSE algorithm identifiers
      const joseAlg = mapToJoseAlgorithm(algorithm);

      // Fetch the key from JWKS
      const key = await getKey(
        { alg: joseAlg },
        { payload: '', signature: '' } as any // Token not used for signature verification
      );

      return key;
    },
  };
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

// Lazy-initialized default resolver
let defaultResolver: KeyResolver | null = null;

export function getDefaultKeyResolver(jwksUrl: string): KeyResolver {
  if (!defaultResolver) {
    defaultResolver = createKeyResolver(jwksUrl);
  }
  return defaultResolver;
}

export function resetDefaultKeyResolver(): void {
  defaultResolver = null;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/middleware/http-signature/jwks.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/middleware/http-signature/jwks.ts test/middleware/http-signature/jwks.test.ts
git commit -m "feat(http-sig): add JWKS key resolution"
```

---

## Task 9: Configuration

**Files:**
- Modify: `src/config/index.ts`
- Test: None (configuration only)

**Step 1: Add HttpSignatureConfig interface and config section**

Add to `src/config/index.ts` after the JwtConfig interface:

```typescript
interface HttpSignatureConfig {
  jwksUrl: string | undefined;
  privateKey: string | undefined;
  keyId: string | undefined;
  defaultAlgorithm: string;
  maxAge: number;
}
```

Update AppConfig interface:

```typescript
interface AppConfig {
  server: ServerConfig;
  jwt: JwtConfig;
  httpSignature: HttpSignatureConfig;
  redis: RedisConfig;
  mssql: MssqlConfig;
}
```

Add config section after jwt:

```typescript
httpSignature: {
  jwksUrl: getEnvString('HTTP_SIG_JWKS_URL'),
  privateKey: getEnvString('HTTP_SIG_PRIVATE_KEY'),
  keyId: getEnvString('HTTP_SIG_KEY_ID'),
  defaultAlgorithm: getEnvString('HTTP_SIG_ALGORITHM', 'rsa-pss-sha512')!,
  maxAge: getEnvInt('HTTP_SIG_MAX_AGE', 300),
},
```

Update exports:

```typescript
export type { AppConfig, ServerConfig, JwtConfig, HttpSignatureConfig, RedisConfig, MssqlConfig };
```

**Step 2: Commit**

```bash
git add src/config/index.ts
git commit -m "feat(http-sig): add HTTP signature configuration"
```

---

## Task 10: Verification Logic

**Files:**
- Create: `src/middleware/http-signature/verify.ts`
- Test: `test/middleware/http-signature/verify.test.ts`

**Step 1: Write the failing test**

```typescript
import { verifySignature, VerificationError } from '../../../src/middleware/http-signature/verify.js';
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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/middleware/http-signature/verify.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/middleware/http-signature/verify.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/middleware/http-signature/verify.ts test/middleware/http-signature/verify.test.ts
git commit -m "feat(http-sig): add signature verification logic"
```

---

## Task 11: Middleware Implementation

**Files:**
- Create: `src/middleware/http-signature/index.ts`
- Create: `src/middleware/http-signature/http-signature-types.ts` (Fastify augmentation)
- Test: `test/middleware/http-signature/middleware.test.ts`

**Step 1: Write the failing test**

```typescript
import { httpSig } from '../../../src/middleware/http-signature/index.js';
import type { FastifyReply } from 'fastify';
import '../../../src/middleware/http-signature/algorithms/rsa-pss-sha512.js';
import { getAlgorithm } from '../../../src/middleware/http-signature/algorithms/index.js';
import { generateKeyPair } from 'jose';
import { buildSignatureBase, buildSignatureParams } from '../../../src/middleware/http-signature/signature-base.js';

interface MockRequest {
  method: string;
  url: string;
  headers: Record<string, string | undefined>;
  hostname: string;
  protocol: string;
  httpSignature?: any;
}

interface MockReply {
  statusCode: number;
  body: any;
  responseHeaders: Record<string, string>;
  code: jest.Mock;
  send: jest.Mock;
  header: jest.Mock;
}

function createMockRequest(overrides: Partial<MockRequest> = {}): MockRequest {
  return {
    method: 'POST',
    url: '/api/data',
    headers: {},
    hostname: 'example.com',
    protocol: 'https',
    ...overrides,
  };
}

function createMockReply(): MockReply {
  const reply: MockReply = {
    statusCode: 200,
    body: null,
    responseHeaders: {},
    code: jest.fn(),
    send: jest.fn(),
    header: jest.fn(),
  };
  reply.code.mockImplementation((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.send.mockImplementation((body: any) => {
    reply.body = body;
    return reply;
  });
  reply.header.mockImplementation((name: string, value: string) => {
    reply.responseHeaders[name] = value;
    return reply;
  });
  return reply;
}

async function callMiddleware(
  middleware: ReturnType<typeof httpSig>,
  request: MockRequest,
  reply: MockReply
) {
  return middleware.call({} as any, request as any, reply as unknown as FastifyReply, jest.fn());
}

// Mock the config
jest.mock('../../../src/config/index.js', () => ({
  config: {
    httpSignature: {
      jwksUrl: 'https://example.com/.well-known/jwks.json',
      maxAge: 300,
      defaultAlgorithm: 'rsa-pss-sha512',
    },
  },
}));

// Mock the key resolver
jest.mock('../../../src/middleware/http-signature/jwks.js', () => {
  let mockPublicKey: any = null;
  return {
    createKeyResolver: jest.fn(() => ({
      resolve: jest.fn(async () => mockPublicKey),
    })),
    getDefaultKeyResolver: jest.fn(() => ({
      resolve: jest.fn(async () => mockPublicKey),
    })),
    setMockPublicKey: (key: any) => {
      mockPublicKey = key;
    },
  };
});

describe('httpSig middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 when Signature header is missing', async () => {
    const middleware = httpSig();
    const request = createMockRequest();
    const reply = createMockReply();

    await callMiddleware(middleware, request, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.body.error).toBe('signature_required');
    expect(reply.responseHeaders['WWW-Authenticate']).toContain('Signature');
  });

  it('should return 401 when Signature-Input header is missing', async () => {
    const middleware = httpSig();
    const request = createMockRequest({
      headers: {
        signature: 'sig1=:dGVzdA==:',
      },
    });
    const reply = createMockReply();

    await callMiddleware(middleware, request, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.body.error).toBe('signature_required');
  });

  it('should return 401 when required components are not covered', async () => {
    const middleware = httpSig({ required: ['content-digest', 'date'] });
    const request = createMockRequest({
      headers: {
        signature: 'sig1=:dGVzdA==:',
        'signature-input': 'sig1=("@method");keyid="k1";alg="rsa-pss-sha512"',
      },
    });
    const reply = createMockReply();

    await callMiddleware(middleware, request, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.body.error).toBe('missing_components');
  });

  it('should verify valid signature and attach info to request', async () => {
    const { publicKey, privateKey } = await generateKeyPair('PS512');

    // Set the mock public key
    const jwksMock = await import('../../../src/middleware/http-signature/jwks.js');
    (jwksMock as any).setMockPublicKey(publicKey);

    const middleware = httpSig();
    const sigInput = {
      label: 'sig1',
      components: ['@method', '@target-uri', '@authority'],
      keyid: 'test-key',
      alg: 'rsa-pss-sha512',
      created: Math.floor(Date.now() / 1000),
    };

    // Build signature params string
    const sigParams = buildSignatureParams(sigInput);

    const request = createMockRequest({
      headers: {
        'signature-input': `sig1=("@method" "@target-uri" "@authority");keyid="test-key";alg="rsa-pss-sha512";created=${sigInput.created}`,
      },
    });

    // Create real signature
    const algo = getAlgorithm('rsa-pss-sha512')!;
    const signatureBase = buildSignatureBase(request as any, sigInput);
    const signatureBytes = await algo.sign(privateKey, new TextEncoder().encode(signatureBase));
    const base64Sig = btoa(String.fromCharCode(...signatureBytes));

    request.headers.signature = `sig1=:${base64Sig}:`;

    const reply = createMockReply();

    await callMiddleware(middleware, request, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(request.httpSignature).toBeDefined();
    expect(request.httpSignature.keyId).toBe('test-key');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/middleware/http-signature/middleware.test.ts`
Expected: FAIL

**Step 3: Create Fastify type augmentation**

Create `src/middleware/http-signature/http-signature-types.ts`:

```typescript
import type { HttpSignatureInfo } from './types.js';

declare module 'fastify' {
  interface FastifyRequest {
    httpSignature?: HttpSignatureInfo;
  }
}
```

**Step 4: Write middleware implementation**

Create `src/middleware/http-signature/index.ts`:

```typescript
import type { preHandlerHookHandler } from 'fastify';
import type { HttpSigOptions, HttpSignatureInfo } from './types.js';
import { config } from '../../config/index.js';
import { parseSignatureInput, parseSignature } from './parse.js';
import { verifySignature } from './verify.js';
import { getDefaultKeyResolver, createKeyResolver } from './jwks.js';

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
```

**Step 5: Run test to verify it passes**

Run: `npm test -- test/middleware/http-signature/middleware.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/middleware/http-signature/index.ts src/middleware/http-signature/http-signature-types.ts test/middleware/http-signature/middleware.test.ts
git commit -m "feat(http-sig): add httpSig middleware"
```

---

## Task 12: Outgoing Request Signing

**Files:**
- Create: `src/middleware/http-signature/sign.ts`
- Test: `test/middleware/http-signature/sign.test.ts`

**Step 1: Write the failing test**

```typescript
import { createSigner } from '../../../src/middleware/http-signature/sign.js';
import '../../../src/middleware/http-signature/algorithms/rsa-pss-sha512.js';
import { generateKeyPair, exportPKCS8 } from 'jose';
import { getAlgorithm } from '../../../src/middleware/http-signature/algorithms/index.js';
import { parseSignatureInput, parseSignature } from '../../../src/middleware/http-signature/parse.js';

describe('createSigner', () => {
  it('should create a signer that produces valid Signature and Signature-Input headers', async () => {
    const { privateKey } = await generateKeyPair('PS512');
    const pemKey = await exportPKCS8(privateKey);

    const signer = await createSigner({
      keyId: 'my-key',
      privateKey: pemKey,
      algorithm: 'rsa-pss-sha512',
      components: ['@method', '@target-uri'],
    });

    const headers = await signer.sign({
      method: 'POST',
      url: 'https://example.com/api/data',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(headers['Signature']).toBeDefined();
    expect(headers['Signature-Input']).toBeDefined();

    // Verify the headers can be parsed
    const sigInputs = parseSignatureInput(headers['Signature-Input']);
    expect(sigInputs).toHaveLength(1);
    expect(sigInputs[0].keyid).toBe('my-key');
    expect(sigInputs[0].alg).toBe('rsa-pss-sha512');
    expect(sigInputs[0].components).toContain('@method');
    expect(sigInputs[0].components).toContain('@target-uri');

    const sigs = parseSignature(headers['Signature']);
    expect(sigs).toHaveLength(1);
  });

  it('should compute Content-Digest when body is provided', async () => {
    const { privateKey } = await generateKeyPair('PS512');
    const pemKey = await exportPKCS8(privateKey);

    const signer = await createSigner({
      keyId: 'my-key',
      privateKey: pemKey,
      algorithm: 'rsa-pss-sha512',
      components: ['@method', 'content-digest'],
    });

    const headers = await signer.sign({
      method: 'POST',
      url: 'https://example.com/api/data',
      headers: { 'Content-Type': 'application/json' },
      body: '{"test": "data"}',
    });

    expect(headers['Content-Digest']).toBeDefined();
    expect(headers['Content-Digest']).toMatch(/^sha-256=:/);
  });

  it('should include original headers in result', async () => {
    const { privateKey } = await generateKeyPair('PS512');
    const pemKey = await exportPKCS8(privateKey);

    const signer = await createSigner({
      keyId: 'my-key',
      privateKey: pemKey,
      algorithm: 'rsa-pss-sha512',
      components: ['@method'],
    });

    const headers = await signer.sign({
      method: 'POST',
      url: 'https://example.com/api/data',
      headers: { 'Content-Type': 'application/json', 'X-Custom': 'value' },
    });

    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Custom']).toBe('value');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/middleware/http-signature/sign.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
import * as crypto from 'node:crypto';
import type { KeyLike } from 'jose';
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
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/middleware/http-signature/sign.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/middleware/http-signature/sign.ts test/middleware/http-signature/sign.test.ts
git commit -m "feat(http-sig): add outgoing request signing"
```

---

## Task 13: Integration Test

**Files:**
- Create: `test/middleware/http-signature/integration.test.ts`

**Step 1: Write integration test**

```typescript
import { generateKeyPair, exportPKCS8 } from 'jose';
import { createSigner } from '../../../src/middleware/http-signature/sign.js';
import { httpSig } from '../../../src/middleware/http-signature/index.js';
import { parseSignatureInput, parseSignature } from '../../../src/middleware/http-signature/parse.js';
import { verifySignature } from '../../../src/middleware/http-signature/verify.js';
import '../../../src/middleware/http-signature/algorithms/rsa-pss-sha512.js';
import type { FastifyReply } from 'fastify';

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
```

**Step 2: Run test**

Run: `npm test -- test/middleware/http-signature/integration.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add test/middleware/http-signature/integration.test.ts
git commit -m "test(http-sig): add integration tests"
```

---

## Task 14: Run All Tests and Final Verification

**Step 1: Run all HTTP signature tests**

Run: `npm test -- test/middleware/http-signature/`
Expected: All tests pass

**Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 3: Build project**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(http-sig): complete RFC9421 HTTP Message Signatures implementation"
```

---

## Summary

This implementation provides:

1. **Verification middleware** (`httpSig()`) following existing `jwtAuth` patterns
2. **Outgoing signing** (`createSigner()`) for calling external APIs
3. **Pluggable algorithms** via registry pattern (RSA-PSS-SHA512, RSA-v1.5-SHA256 built-in)
4. **JWKS key resolution** reusing `jose` library
5. **RFC9421-compliant error responses** with challenge headers
6. **Full test coverage** with unit and integration tests

Files created:
- `src/middleware/http-signature/types.ts`
- `src/middleware/http-signature/algorithms/index.ts`
- `src/middleware/http-signature/algorithms/rsa-pss-sha512.ts`
- `src/middleware/http-signature/algorithms/rsa-v1_5-sha256.ts`
- `src/middleware/http-signature/components.ts`
- `src/middleware/http-signature/signature-base.ts`
- `src/middleware/http-signature/parse.ts`
- `src/middleware/http-signature/jwks.ts`
- `src/middleware/http-signature/verify.ts`
- `src/middleware/http-signature/sign.ts`
- `src/middleware/http-signature/http-signature-types.ts`
- `src/middleware/http-signature/index.ts`
- `test/middleware/http-signature/*.test.ts`

Modified:
- `src/config/index.ts` (added httpSignature config)
