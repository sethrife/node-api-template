import { generateKeyPair } from 'jose';
import '../../../../src/middleware/http-signature/algorithms/rsa-pss-sha512.js';
import { getAlgorithm } from '../../../../src/middleware/http-signature/algorithms/index.js';

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
