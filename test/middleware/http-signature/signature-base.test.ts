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
  } as unknown as FastifyRequest;
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
