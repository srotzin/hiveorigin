/**
 * HiveOrigin — Spectral receipt emitter
 *
 * Non-blocking. Never throws. If hive-receipt.onrender.com is unavailable,
 * the receipt attempt is silently discarded — it must never block the fee path.
 */

const RECEIPT_ENDPOINT =
  process.env.RECEIPT_HOST
    ? `${process.env.RECEIPT_HOST}/v1/receipt/sign`
    : 'https://hive-receipt.onrender.com/v1/receipt/sign';

const ISSUER_DID = 'did:hive:hiveorigin';
const SERVICE    = 'hiveorigin';

/**
 * Emit a Spectral receipt for a paid API call.
 *
 * @param {object} opts
 * @param {string} opts.path        - Request path, e.g. '/v1/origin/issue'
 * @param {number} opts.amount      - Amount in USDC
 * @param {string} opts.eventType   - e.g. 'origin.issue'
 * @param {string} opts.refId       - cert_id or other correlation ID
 */
export function emitReceipt({ path, amount, eventType, refId }) {
  // Fire-and-forget — never await this
  (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4_000);
      await fetch(RECEIPT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          issuer_did:  ISSUER_DID,
          event_type:  eventType,
          amount_usd:  amount,
          currency:    'USDC',
          endpoint:    path,
          ref_id:      refId,
          service:     SERVICE,
          timestamp:   new Date().toISOString(),
        }),
      });
      clearTimeout(timer);
    } catch (_) {
      // Non-blocking — swallow all errors
    }
  })();
}
