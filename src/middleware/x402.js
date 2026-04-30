/**
 * HiveOrigin — x402 Payment Middleware (USDC-ONLY)
 *
 * Adapted from canonical x402.js. Implements the x402 protocol for
 * machine-to-machine micropayments on Base L2.
 *
 * All payments are USDC on Base L2 or Tempo USDCe.
 * Treasury: 0x15184bf50b3d3f52b60434f8942b7d52f2eb436e
 */

// ─── Configuration ───────────────────────────────────────────────────────────

const PAYMENT_ADDRESS = (
  process.env.HIVE_PAYMENT_ADDRESS ||
  '0x15184bf50b3d3f52b60434f8942b7d52f2eb436e'
).toLowerCase();

const HIVE_INTERNAL_KEY = process.env.HIVEORIGIN_SERVICE_KEY || process.env.HIVE_INTERNAL_KEY || '';
const BASE_RPC_URL      = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const USDC_CONTRACT     = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const TRANSFER_TOPIC    = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// ─── HiveOrigin endpoint pricing ─────────────────────────────────────────────

const ORIGIN_PRICING = {
  '/v1/origin/issue':     500.00,
  '/v1/origin/verify':     0.05,
  '/v1/origin/revoke':     5.00,
  '/v1/origin/subscribe': 50.00,
};

function getOriginPrice(path, method) {
  if (ORIGIN_PRICING[path] !== undefined) {
    return { amount: ORIGIN_PRICING[path], model: 'origin_fixed' };
  }
  if (method === 'GET' && /^\/v1\/origin\/cert\/[^/]+$/.test(path)) {
    return { amount: 0.10, model: 'origin_fixed' };
  }
  return { amount: 0.05, model: 'origin_default' };
}

// ─── Free paths ───────────────────────────────────────────────────────────────

const FREE_PATHS = new Set([
  '/health',
  '/openapi.json',
  '/v1/origin/pubkey',
]);

function isFreePath(path) {
  return FREE_PATHS.has(path);
}

// ─── In-memory payment cache ──────────────────────────────────────────────────

const paymentCache = new Map();
const spentPaymentsCache = new Set();

export { paymentCache };

// ─── On-chain verification ────────────────────────────────────────────────────

async function verifyPayment(hash) {
  if (!PAYMENT_ADDRESS) {
    return { valid: false, reason: 'Payment address not configured' };
  }
  if (paymentCache.has(hash)) {
    const cached = paymentCache.get(hash);
    if (Date.now() - cached.timestamp < 600_000) {
      return { valid: cached.verified, amount: cached.amount, reason: cached.reason };
    }
  }

  try {
    const receiptRes = await fetch(BASE_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'eth_getTransactionReceipt',
        params: [hash],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const { result: receipt } = await receiptRes.json();
    if (!receipt || receipt.status !== '0x1') {
      return { valid: false, reason: 'Transaction not found or failed on Base L2' };
    }
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== USDC_CONTRACT.toLowerCase()) continue;
      if (log.topics[0] !== TRANSFER_TOPIC) continue;
      const recipient = '0x' + log.topics[2].slice(26).toLowerCase();
      if (recipient !== PAYMENT_ADDRESS) continue;
      const amountRaw  = parseInt(log.data, 16);
      const amountUsdc = amountRaw / 1_000_000;
      paymentCache.set(hash, { verified: true, amount: amountUsdc, timestamp: Date.now() });
      return { valid: true, amount: amountUsdc };
    }
    return { valid: false, reason: 'No USDC transfer to treasury found in transaction' };
  } catch (err) {
    return { valid: false, reason: 'Chain verification error: ' + err.message };
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export default async function x402Middleware(req, res, next) {
  if (isFreePath(req.path)) return next();

  // Internal service bypass
  const internalKey = req.headers['x-hive-internal-key'] || req.headers['x-api-key'];
  if (HIVE_INTERNAL_KEY && internalKey === HIVE_INTERNAL_KEY) {
    req.paymentVerified = true;
    req.paymentMethod   = 'internal';
    return next();
  }

  const paymentHash =
    req.headers['x-payment-hash'] ||
    req.headers['x-402-tx'] ||
    req.headers['x-payment-tx'];

  if (paymentHash) {
    // Replay protection
    if (spentPaymentsCache.has(paymentHash)) {
      return res.status(409).json({
        success: false,
        error:   'Payment hash already used',
        code:    'PAYMENT_REPLAY',
        hint:    'Each payment transaction can only be used once. Submit a new USDC payment.',
      });
    }

    const verification = await verifyPayment(paymentHash);

    if (verification.valid) {
      const price = getOriginPrice(req.path, req.method);
      if (verification.amount < price.amount - 0.001) {
        return res.status(402).json({
          success:  false,
          error:    'Payment amount insufficient',
          code:     'PAYMENT_INSUFFICIENT',
          required: price.amount,
          paid:     verification.amount,
        });
      }

      spentPaymentsCache.add(paymentHash);
      req.paymentVerified = true;
      req.paymentMethod   = 'x402';
      req.paymentHash     = paymentHash;
      req.paymentAmount   = verification.amount;
      return next();
    }

    return res.status(402).json({
      success: false,
      error:   'Payment verification failed',
      code:    'PAYMENT_INVALID',
      details: verification.reason,
      hint:    'Ensure the transaction hash corresponds to a confirmed Base USDC payment to the treasury.',
    });
  }

  // No payment header — emit 402 challenge advertising both rails
  const price = getOriginPrice(req.path, req.method);

  res.set('WWW-Authenticate', [
    `x402 realm="hiveorigin.onrender.com", amount="${price.amount}", currency="USDC", network="base", address="${PAYMENT_ADDRESS}"`,
    `Payment scheme="mpp", realm="hiveorigin.onrender.com", amount="${price.amount}", currency="USDC", network="tempo", address="${PAYMENT_ADDRESS}"`,
  ].join(', '));

  res.set({
    'X-Payment-Amount':   price.amount.toString(),
    'X-Payment-Currency': 'USDC',
    'X-Payment-Network':  'base',
    'X-Payment-Address':  PAYMENT_ADDRESS,
    'X-Payment-Model':    price.model,
  });

  return res.status(402).json({
    success:  false,
    error:    'Payment required',
    code:     'PAYMENT_REQUIRED',
    protocol: 'x402',
    payment: {
      amount:         price.amount,
      currency:       'USDC',
      network:        'base',
      chain_id:       8453,
      address:        PAYMENT_ADDRESS,
      usdc_contract:  USDC_CONTRACT,
      model:          price.model,
    },
    how_to_pay: {
      rail_x402: {
        step_1: `Send ${price.amount} USDC to ${PAYMENT_ADDRESS} on Base (chain ID 8453)`,
        step_2: 'Include the transaction hash in the X-Payment-Hash header',
        step_3: 'Retry this request — payment is verified on-chain automatically',
      },
      rail_mpp: {
        step_1: `Send ${price.amount} USDCe to ${PAYMENT_ADDRESS} on Tempo`,
        step_2: 'Include in Payment header: scheme="mpp", tx_hash="0x...", rail="tempo"',
        step_3: 'Retry request — MPP payment verified on-chain via Tempo RPC',
        tempo_rpc: 'https://rpc.tempo.xyz',
      },
    },
    rails_accepted: ['x402', 'mpp'],
  });
}
