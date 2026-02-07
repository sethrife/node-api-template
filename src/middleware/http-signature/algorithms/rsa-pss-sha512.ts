import * as crypto from 'node:crypto';
import type { KeyLike } from '../types.js';
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
