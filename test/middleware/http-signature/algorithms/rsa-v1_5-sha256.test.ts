import { generateKeyPair } from 'jose';
import '../../../../src/middleware/http-signature/algorithms/rsa-v1_5-sha256.js';
import { getAlgorithm } from '../../../../src/middleware/http-signature/algorithms/index.js';

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
