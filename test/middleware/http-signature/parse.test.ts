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
