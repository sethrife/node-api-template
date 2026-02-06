import type { CryptoKey, KeyObject } from 'jose';

/**
 * Key type for signature operations (compatible with jose v6+)
 */
export type KeyLike = CryptoKey | KeyObject | Uint8Array;

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
