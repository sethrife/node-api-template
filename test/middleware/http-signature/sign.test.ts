import { createSigner } from '../../../src/middleware/http-signature/sign.js';
import '../../../src/middleware/http-signature/algorithms/rsa-pss-sha512.js';
import { generateKeyPair, exportPKCS8 } from 'jose';
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
