/**
 * HiveOrigin — Ed25519 signer
 *
 * Manages the service signing key derived from ORIGIN_SIGNING_SEED env var.
 * Falls back to a deterministic key derived from HIVE_INTERNAL_KEY or a
 * fixed anchor string so the service starts with no configuration.
 *
 * Every paid response is a JCS-canonical Ed25519-signed envelope.
 */

import * as ed from '@noble/ed25519';
import { canonicalize, canonicalBytes } from './canonical.js';

const ISSUER_DID = 'did:hive:hiveorigin';

let _signerKey = null;

function bytesToBase64url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function getSignerKey() {
  if (_signerKey) return _signerKey;

  const seedHex = process.env.ORIGIN_SIGNING_SEED || process.env.SERVER_DID_SEED;
  let privKey;

  if (seedHex && seedHex.length >= 64) {
    privKey = Uint8Array.from(Buffer.from(seedHex.slice(0, 64), 'hex'));
  } else {
    const anchor = process.env.HIVE_INTERNAL_KEY || 'hive-origin-issuer-2026';
    const { createHash } = await import('crypto');
    const seed = createHash('sha256')
      .update(anchor + '-origin-signing-key')
      .digest();
    privKey = Uint8Array.from(seed);
  }

  const pubKey = await ed.getPublicKeyAsync(privKey);
  _signerKey = { privKey, pubKey };
  return _signerKey;
}

export async function getPubkeyInfo() {
  const { pubKey } = await getSignerKey();
  return {
    issuer: ISSUER_DID,
    algorithm: 'Ed25519',
    pubkey_b64u: bytesToBase64url(pubKey),
    pubkey_hex: Buffer.from(pubKey).toString('hex'),
  };
}

/**
 * Sign a JCS-canonical payload with the service Ed25519 key.
 * Returns { envelope, proof } where proof includes the signature.
 */
export async function signEnvelope(payload) {
  const { privKey, pubKey } = await getSignerKey();
  const bytes = canonicalBytes(payload);
  const sigBytes = await ed.signAsync(bytes, privKey);

  return {
    envelope: payload,
    proof: {
      type: 'Ed25519Signature2020',
      created: new Date().toISOString(),
      verificationMethod: `${ISSUER_DID}#key-1`,
      proofPurpose: 'assertionMethod',
      jcs: canonicalize(payload),
      pubkey_b64u: bytesToBase64url(pubKey),
      signature_b64u: bytesToBase64url(sigBytes),
    },
  };
}
