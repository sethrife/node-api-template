import * as crypto from 'node:crypto';
import type { KeyLike } from '../types.js';
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
