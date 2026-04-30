/**
 * HiveOrigin — in-memory cert store
 *
 * Primary index: cert_id (UUID v4)  → cert object
 * Secondary index: weights_sha256   → cert_id (for cross-lookup)
 * Subscription index: cert_id       → subscription object
 *
 * TODO: Migrate to Postgres when cert volume warrants persistence.
 *       Schema: CREATE TABLE origin_certs (cert_id UUID PRIMARY KEY, data JSONB, ...)
 *               CREATE INDEX ON origin_certs ((data->>'weights_sha256'));
 */

/** @type {Map<string, object>} cert_id → cert */
const certStore = new Map();

/** @type {Map<string, string>} weights_sha256 → cert_id */
const weightIndex = new Map();

/** @type {Map<string, object>} cert_id → subscription */
const subscriptionStore = new Map();

// ─── Cert operations ────────────────────────────────────────────────────────

/**
 * Persist a new cert. Indexes by cert_id and weights_sha256.
 * @param {object} cert  Must contain cert_id and weights_sha256 fields.
 */
export function putCert(cert) {
  certStore.set(cert.cert_id, cert);
  weightIndex.set(cert.weights_sha256, cert.cert_id);
}

/**
 * Retrieve a cert by cert_id.
 * @param {string} certId
 * @returns {object|null}
 */
export function getCert(certId) {
  return certStore.get(certId) || null;
}

/**
 * Retrieve a cert by weights_sha256.
 * @param {string} sha256
 * @returns {object|null}
 */
export function getCertByWeights(sha256) {
  const certId = weightIndex.get(sha256);
  if (!certId) return null;
  return certStore.get(certId) || null;
}

/**
 * Update (replace) a cert in the store. cert_id must already exist.
 * Used for revocation mutations.
 * @param {object} cert
 */
export function updateCert(cert) {
  if (!certStore.has(cert.cert_id)) {
    throw new Error(`cert_id ${cert.cert_id} not found in store`);
  }
  certStore.set(cert.cert_id, cert);
  // Re-index weights in case it changed (it shouldn't, but belt-and-suspenders)
  weightIndex.set(cert.weights_sha256, cert.cert_id);
}

/**
 * Return total number of certs in the store.
 */
export function certCount() {
  return certStore.size;
}

// ─── Subscription operations ────────────────────────────────────────────────

/**
 * Record a continuous-monitoring subscription.
 * @param {object} sub  Must contain cert_id.
 */
export function putSubscription(sub) {
  subscriptionStore.set(sub.cert_id, sub);
}

/**
 * Retrieve a subscription by cert_id.
 * @param {string} certId
 * @returns {object|null}
 */
export function getSubscription(certId) {
  return subscriptionStore.get(certId) || null;
}

/**
 * Return total number of subscriptions.
 */
export function subscriptionCount() {
  return subscriptionStore.size;
}
