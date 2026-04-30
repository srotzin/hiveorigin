/**
 * HiveOrigin — /v1/origin routes
 *
 * Model-pedigree certificate surface. Closes the question:
 * "Is this really GPT-5.4 or a fine-tuned adversarial fork?"
 *
 * Endpoints:
 *   GET  /pubkey        FREE    — Ed25519 issuer pubkey
 *   POST /issue         $500    — Issue a model-pedigree certificate
 *   POST /verify        $0.05   — Verify a cert by cert_id or weights_sha256
 *   POST /revoke        $5.00   — Append revocation event (terminal)
 *   POST /subscribe     $50/mo  — Continuous-monitoring subscription
 *   GET  /cert/:cert_id $0.10   — Read a cert by id
 *
 * Doctrine: PROVABLE pillar — model provenance is content authenticity
 * at the model level.
 *
 * Treasury: 0x15184bf50b3d3f52b60434f8942b7d52f2eb436e
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { signEnvelope, getPubkeyInfo } from '../lib/sign.js';
import { emitReceipt } from '../lib/receipt.js';
import {
  putCert, getCert, getCertByWeights, updateCert,
  certCount, putSubscription, subscriptionCount,
} from '../lib/store.js';

const router = Router();
const ISSUER_DID = 'did:hive:hiveorigin';

// ─── Validation helpers ───────────────────────────────────────────────────────

const SHA256_RE = /^[a-f0-9]{64}$/;

function isValidSha256(v) {
  return typeof v === 'string' && SHA256_RE.test(v);
}

function isValidIso8601(v) {
  if (typeof v !== 'string') return false;
  const t = Date.parse(v);
  return !Number.isNaN(t);
}

function isNotFuture(isoString) {
  return Date.parse(isoString) <= Date.now();
}

function isValidEvaluatorSignatures(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  for (const item of arr) {
    if (
      typeof item !== 'object' ||
      typeof item.issuer_did !== 'string' ||
      !item.issuer_did.startsWith('did:') ||
      typeof item.sig_b64u !== 'string' ||
      item.sig_b64u.length === 0
    ) {
      return false;
    }
  }
  return true;
}

function err(res, code, message, httpCode = 400) {
  return res.status(httpCode).json({ success: false, error: message, code });
}

// ─── GET /v1/origin/pubkey (free) ─────────────────────────────────────────────

router.get('/pubkey', async (req, res) => {
  try {
    const info = await getPubkeyInfo();
    return res.json({ success: true, ...info });
  } catch (e) {
    return err(res, 'internal_error', e.message, 500);
  }
});

// ─── POST /v1/origin/issue ($500 USDC) ───────────────────────────────────────
//
// Body: {
//   model_id, base_model, training_dataset_hash, training_completion_iso,
//   weights_sha256, evaluator_signatures?, claims?, expires_at?
// }

router.post('/issue', async (req, res) => {
  try {
    const {
      model_id,
      base_model,
      training_dataset_hash,
      training_completion_iso,
      weights_sha256,
      evaluator_signatures,
      claims,
      expires_at,
    } = req.body || {};

    // Required field validation
    if (!model_id || typeof model_id !== 'string') {
      return err(res, 'invalid_request', 'model_id is required');
    }
    if (!base_model || typeof base_model !== 'string') {
      return err(res, 'invalid_request', 'base_model is required');
    }
    if (!training_dataset_hash) {
      return err(res, 'invalid_request', 'training_dataset_hash is required');
    }
    if (!isValidSha256(training_dataset_hash)) {
      return err(res, 'invalid_training_dataset_hash',
        'training_dataset_hash must be a lowercase hex SHA-256 (64 chars)');
    }
    if (!training_completion_iso) {
      return err(res, 'invalid_request', 'training_completion_iso is required');
    }
    if (!isValidIso8601(training_completion_iso)) {
      return err(res, 'invalid_training_completion_iso',
        'training_completion_iso must be valid ISO 8601');
    }
    if (!isNotFuture(training_completion_iso)) {
      return err(res, 'invalid_training_completion_iso',
        'training_completion_iso must not be in the future');
    }
    if (!weights_sha256) {
      return err(res, 'invalid_request', 'weights_sha256 is required');
    }
    if (!isValidSha256(weights_sha256)) {
      return err(res, 'invalid_weights_sha256',
        'weights_sha256 must be a lowercase hex SHA-256 (64 chars)');
    }
    if (evaluator_signatures !== undefined && evaluator_signatures !== null) {
      if (!isValidEvaluatorSignatures(evaluator_signatures)) {
        return err(res, 'invalid_evaluator_signatures',
          'evaluator_signatures must be a non-empty array of {issuer_did, sig_b64u} objects');
      }
    }
    if (expires_at !== undefined && expires_at !== null) {
      if (!isValidIso8601(expires_at)) {
        return err(res, 'invalid_expires_at', 'expires_at must be valid ISO 8601');
      }
    }

    const cert_id     = uuidv4();
    const issued_at   = new Date().toISOString();

    const certPayload = {
      version:                 'hive-origin/v1',
      cert_id,
      issuer:                  ISSUER_DID,
      model_id,
      base_model,
      training_dataset_hash,
      training_completion_iso,
      weights_sha256,
      issued_at,
      expires_at:              expires_at || null,
      evaluator_signatures:    evaluator_signatures || [],
      claims:                  claims || {},
      revoked:                 false,
      revoked_at:              null,
      revocation_reason:       null,
    };

    const signed = await signEnvelope(certPayload);

    // Store cert object with signed envelope
    const storedCert = {
      ...certPayload,
      signed_envelope: signed,
    };
    putCert(storedCert);

    emitReceipt({
      path:      '/v1/origin/issue',
      amount:    500.00,
      eventType: 'origin.issue',
      refId:     cert_id,
    });

    return res.status(201).json({
      success: true,
      cert_id,
      ...signed,
    });
  } catch (e) {
    console.error('[origin.issue] failed:', e.message);
    return err(res, 'internal_error', e.message, 500);
  }
});

// ─── POST /v1/origin/verify ($0.05 USDC) ─────────────────────────────────────
//
// Body: { cert_id? } or { weights_sha256? } — at least one required.
// Returns: { valid, cert_id, revocation_status, scope_freeze, ... signed_envelope }

router.post('/verify', async (req, res) => {
  try {
    const { cert_id, weights_sha256 } = req.body || {};

    if (!cert_id && !weights_sha256) {
      return err(res, 'invalid_request', 'cert_id or weights_sha256 required');
    }

    let cert = null;
    if (cert_id) {
      cert = getCert(cert_id);
    } else if (weights_sha256) {
      if (!isValidSha256(weights_sha256)) {
        return err(res, 'invalid_weights_sha256',
          'weights_sha256 must be a lowercase hex SHA-256 (64 chars)');
      }
      cert = getCertByWeights(weights_sha256);
    }

    if (!cert) {
      return err(res, 'not_found', 'Certificate not found', 404);
    }

    let valid = true;
    let reason = null;

    // Revocation check
    if (cert.revoked) {
      valid  = false;
      reason = `revoked at ${cert.revoked_at}: ${cert.revocation_reason || 'no reason provided'}`;
    }

    // Expiry check
    if (cert.expires_at && Date.parse(cert.expires_at) < Date.now()) {
      valid  = false;
      reason = reason || `expired at ${cert.expires_at}`;
    }

    const verifyPayload = {
      version:           'hive-origin-verify/v1',
      cert_id:           cert.cert_id,
      checked_at:        new Date().toISOString(),
      valid,
      reason,
      revocation_status: cert.revoked ? 'revoked' : 'active',
      revoked_at:        cert.revoked_at || null,
      revocation_reason: cert.revocation_reason || null,
      scope_freeze:      false,
      model_id:          cert.model_id,
      base_model:        cert.base_model,
      weights_sha256:    cert.weights_sha256,
      issued_at:         cert.issued_at,
      expires_at:        cert.expires_at || null,
      issuer:            ISSUER_DID,
    };

    const signed = await signEnvelope(verifyPayload);

    emitReceipt({
      path:      '/v1/origin/verify',
      amount:    0.05,
      eventType: 'origin.verify',
      refId:     cert.cert_id,
    });

    return res.json({
      success: true,
      ...signed,
    });
  } catch (e) {
    console.error('[origin.verify] failed:', e.message);
    return err(res, 'internal_error', e.message, 500);
  }
});

// ─── POST /v1/origin/revoke ($5.00 USDC) ─────────────────────────────────────
//
// Body: { cert_id, reason, evidence? }
// Terminal — cannot be undone.

router.post('/revoke', async (req, res) => {
  try {
    const { cert_id, reason, evidence } = req.body || {};

    if (!cert_id) return err(res, 'invalid_request', 'cert_id required');
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return err(res, 'invalid_request', 'reason required');
    }

    const cert = getCert(cert_id);
    if (!cert) {
      return err(res, 'not_found', 'Certificate not found', 404);
    }

    if (cert.revoked) {
      return res.status(409).json({
        success: false,
        error:   'Certificate is already revoked (terminal state)',
        code:    'TERMINAL_STATE',
        revoked_at:        cert.revoked_at,
        revocation_reason: cert.revocation_reason,
      });
    }

    const revoked_at = new Date().toISOString();
    const updatedCert = {
      ...cert,
      revoked:           true,
      revoked_at,
      revocation_reason: reason.trim(),
      revocation_evidence: evidence || null,
    };
    updateCert(updatedCert);

    const revokePayload = {
      version:             'hive-origin-revoke/v1',
      cert_id,
      revoked_at,
      revocation_reason:   reason.trim(),
      revocation_evidence: evidence || null,
      issuer:              ISSUER_DID,
      model_id:            cert.model_id,
      weights_sha256:      cert.weights_sha256,
    };

    const signed = await signEnvelope(revokePayload);

    emitReceipt({
      path:      '/v1/origin/revoke',
      amount:    5.00,
      eventType: 'origin.revoke',
      refId:     cert_id,
    });

    console.log(`[origin.revoke] cert ${cert_id} revoked at ${revoked_at} — reason: ${reason}`);

    return res.json({
      success: true,
      cert_id,
      revoked_at,
      ...signed,
    });
  } catch (e) {
    console.error('[origin.revoke] failed:', e.message);
    return err(res, 'internal_error', e.message, 500);
  }
});

// ─── POST /v1/origin/subscribe ($50/mo USDC) ─────────────────────────────────
//
// Body: { cert_id, contact_email, billing_period_iso }
// Records continuous-monitoring subscription.
// TODO: Wire Stripe billing when billing_period_iso is recurring.

router.post('/subscribe', async (req, res) => {
  try {
    const { cert_id, contact_email, billing_period_iso } = req.body || {};

    if (!cert_id) return err(res, 'invalid_request', 'cert_id required');
    if (!contact_email || typeof contact_email !== 'string') {
      return err(res, 'invalid_request', 'contact_email required');
    }
    if (!billing_period_iso || !isValidIso8601(billing_period_iso)) {
      return err(res, 'invalid_request', 'billing_period_iso must be valid ISO 8601');
    }

    const cert = getCert(cert_id);
    if (!cert) {
      return err(res, 'not_found', 'Certificate not found', 404);
    }

    const subscription_id = uuidv4();
    const subscribed_at   = new Date().toISOString();

    const sub = {
      subscription_id,
      cert_id,
      contact_email,
      billing_period_iso,
      subscribed_at,
      status: 'active',
      // TODO: Stripe subscription ID when Stripe billing is wired
      stripe_subscription_id: null,
    };

    putSubscription(sub);

    const subPayload = {
      version:           'hive-origin-subscribe/v1',
      subscription_id,
      cert_id,
      subscribed_at,
      billing_period_iso,
      status:            'active',
      issuer:            ISSUER_DID,
      todo:              'Stripe billing integration pending — subscriptions are in-memory in v0.1',
    };

    const signed = await signEnvelope(subPayload);

    emitReceipt({
      path:      '/v1/origin/subscribe',
      amount:    50.00,
      eventType: 'origin.subscribe',
      refId:     subscription_id,
    });

    return res.status(201).json({
      success: true,
      subscription_id,
      ...signed,
    });
  } catch (e) {
    console.error('[origin.subscribe] failed:', e.message);
    return err(res, 'internal_error', e.message, 500);
  }
});

// ─── GET /v1/origin/cert/:cert_id ($0.10 USDC) ───────────────────────────────

router.get('/cert/:cert_id', async (req, res) => {
  try {
    const { cert_id } = req.params;

    const cert = getCert(cert_id);
    if (!cert) {
      return err(res, 'not_found', 'Certificate not found', 404);
    }

    // Return the stored signed envelope
    emitReceipt({
      path:      '/v1/origin/cert/' + cert_id,
      amount:    0.10,
      eventType: 'origin.cert.read',
      refId:     cert_id,
    });

    return res.json({
      success: true,
      cert_id,
      ...cert.signed_envelope,
    });
  } catch (e) {
    console.error('[origin.cert] failed:', e.message);
    return err(res, 'internal_error', e.message, 500);
  }
});

export default router;
export { certCount, subscriptionCount };
