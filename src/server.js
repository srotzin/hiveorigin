/**
 * HiveOrigin — server.js
 *
 * ESM Express 5 server factory.
 * Payment rails: x402 (Base USDC) + MPP (Tempo USDCe).
 * Both rails mounted on /v1.
 *
 * Treasury: 0x15184bf50b3d3f52b60434f8942b7d52f2eb436e
 * USDC (Base): 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913
 * Tempo USDCe: 0x20c000000000000000000000b9537d11c60e8b50
 */

import express from 'express';
import x402Middleware from './middleware/x402.js';
import mppMiddleware  from './middleware/mpp.js';
import originRouter   from './routes/origin.js';
import { certCount, subscriptionCount } from './routes/origin.js';

const TREASURY    = '0x15184bf50b3d3f52b60434f8942b7d52f2eb436e';
const USDC_BASE   = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const TEMPO_USDCE = '0x20c000000000000000000000b9537d11c60e8b50';
const VERSION     = '0.1.0';

// ─── OpenAPI / x-mpp manifest ─────────────────────────────────────────────────

const openApiDoc = {
  openapi: '3.1.0',
  info: {
    title:       'HiveOrigin',
    version:     VERSION,
    description: 'Model-pedigree certificate surface. PROVABLE pillar: model provenance at training completion.',
    contact: {
      name: 'Hive Civilization',
      url:  'https://hiveorigin.onrender.com',
    },
    license: { name: 'MIT' },
  },
  servers: [
    { url: 'https://hiveorigin.onrender.com', description: 'Production' },
  ],
  'x-mpp': {
    realm:       'hiveorigin.onrender.com',
    service_did: 'did:hive:hiveorigin',
    payment: {
      method:    'tempo',
      currency:  'USDCe',
      contract:  TEMPO_USDCE,
      decimals:  6,
      recipient: TREASURY,
    },
    rails:       ['x402', 'mpp'],
    categories:  ['identity', 'provenance', 'ai-safety'],
    integration: 'first-party',
    tags: [
      'model-provenance',
      'training-completion',
      'weights-attestation',
      'hive-origin',
      'authenticatable',
      'eu-ai-act-annex-iv',
    ],
    treasury: {
      base:  { address: TREASURY, usdc_contract: USDC_BASE, chain_id: 8453 },
      tempo: { address: TREASURY, usdc_contract: TEMPO_USDCE, rpc: 'https://rpc.tempo.xyz' },
    },
  },
  paths: {
    '/health': {
      get: {
        summary:     'Liveness check',
        operationId: 'health',
        tags:        ['system'],
        responses: {
          '200': {
            description: 'Service is live',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status:        { type: 'string', example: 'ok' },
                    version:       { type: 'string', example: VERSION },
                    cert_count:    { type: 'integer' },
                    sub_count:     { type: 'integer' },
                    timestamp:     { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/openapi.json': {
      get: {
        summary:     'OpenAPI spec with x-mpp payment discovery block',
        operationId: 'openApiSpec',
        tags:        ['system'],
        responses: {
          '200': { description: 'OpenAPI 3.1.0 document' },
        },
      },
    },
    '/v1/origin/pubkey': {
      get: {
        summary:     'Ed25519 issuer public key',
        operationId: 'getPubkey',
        tags:        ['origin'],
        responses: {
          '200': { description: 'Issuer public key (base64url + hex)' },
        },
      },
    },
    '/v1/origin/issue': {
      post: {
        summary:     'Issue a model-pedigree certificate',
        operationId: 'issueCert',
        tags:        ['origin'],
        'x-payment': { amount: 500.00, currency: 'USDC', rails: ['x402', 'mpp'] },
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['model_id', 'base_model', 'training_dataset_hash', 'training_completion_iso', 'weights_sha256'],
                properties: {
                  model_id:                { type: 'string', description: 'Unique model identifier' },
                  base_model:              { type: 'string', description: 'Foundation model identifier' },
                  training_dataset_hash:   { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'SHA-256 of training dataset' },
                  training_completion_iso: { type: 'string', format: 'date-time', description: 'ISO 8601 training completion timestamp (not future)' },
                  weights_sha256:          { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'SHA-256 of model weights' },
                  evaluator_signatures:    { type: 'array', items: { type: 'object', required: ['issuer_did', 'sig_b64u'], properties: { issuer_did: { type: 'string' }, sig_b64u: { type: 'string' } } } },
                  claims:                  { type: 'object', description: 'Additional issuer claims' },
                  expires_at:              { type: 'string', format: 'date-time', description: 'ISO 8601 certificate expiry' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Certificate issued — Ed25519-signed envelope returned' },
          '400': { description: 'Validation error' },
          '402': { description: 'Payment required' },
        },
      },
    },
    '/v1/origin/verify': {
      post: {
        summary:     'Verify a certificate by cert_id or weights_sha256',
        operationId: 'verifyCert',
        tags:        ['origin'],
        'x-payment': { amount: 0.05, currency: 'USDC', rails: ['x402', 'mpp'] },
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  cert_id:        { type: 'string', format: 'uuid' },
                  weights_sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Verification result — valid, revocation status, scope freeze state' },
          '402': { description: 'Payment required' },
          '404': { description: 'Certificate not found' },
        },
      },
    },
    '/v1/origin/revoke': {
      post: {
        summary:     'Revoke a certificate (terminal, irreversible)',
        operationId: 'revokeCert',
        tags:        ['origin'],
        'x-payment': { amount: 5.00, currency: 'USDC', rails: ['x402', 'mpp'] },
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['cert_id', 'reason'],
                properties: {
                  cert_id:  { type: 'string', format: 'uuid' },
                  reason:   { type: 'string' },
                  evidence: { type: 'string', description: 'Supporting evidence URL or statement' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Revocation recorded — signed audit envelope returned' },
          '402': { description: 'Payment required' },
          '404': { description: 'Certificate not found' },
          '409': { description: 'Certificate already revoked' },
        },
      },
    },
    '/v1/origin/subscribe': {
      post: {
        summary:     'Subscribe to continuous revocation monitoring',
        operationId: 'subscribeCert',
        tags:        ['origin'],
        'x-payment': { amount: 50.00, currency: 'USDC', billing: 'continuous', period: 'monthly', rails: ['x402', 'mpp'] },
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['cert_id', 'contact_email', 'billing_period_iso'],
                properties: {
                  cert_id:            { type: 'string', format: 'uuid' },
                  contact_email:      { type: 'string', format: 'email' },
                  billing_period_iso: { type: 'string', format: 'date-time', description: 'Subscription period start (ISO 8601)' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Subscription created' },
          '402': { description: 'Payment required' },
          '404': { description: 'Certificate not found' },
        },
      },
    },
    '/v1/origin/cert/{cert_id}': {
      get: {
        summary:     'Retrieve a certificate by ID (signed envelope)',
        operationId: 'getCert',
        tags:        ['origin'],
        'x-payment': { amount: 0.10, currency: 'USDC', rails: ['x402', 'mpp'] },
        parameters: [
          { name: 'cert_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Signed certificate envelope' },
          '402': { description: 'Payment required' },
          '404': { description: 'Certificate not found' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      x402: {
        type:        'apiKey',
        in:          'header',
        name:        'X-Payment-Hash',
        description: 'x402 payment: send USDC to treasury on Base, pass transaction hash here',
      },
      mpp: {
        type:        'apiKey',
        in:          'header',
        name:        'Payment',
        description: 'MPP payment: Payment: scheme="mpp", tx_hash="0x...", rail="tempo"',
      },
    },
  },
};

// ─── App factory ─────────────────────────────────────────────────────────────

export function createServer() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Health (free) ──────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({
      status:     'ok',
      service:    'hiveorigin',
      version:    VERSION,
      cert_count: certCount(),
      sub_count:  subscriptionCount(),
      timestamp:  new Date().toISOString(),
      treasury:   TREASURY,
      rails:      ['x402', 'mpp'],
    });
  });

  // ── OpenAPI manifest (free) ────────────────────────────────────────────────
  app.get('/openapi.json', (_req, res) => {
    res.json(openApiDoc);
  });

  // ── /llms.txt (free) — LLM-friendly natural-language API guide ────────────
  // Convention: https://llmstxt.org/
  app.get('/llms.txt', async (_req, res) => {
    const { LLMS_TXT } = await import('./llms.txt.js');
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(LLMS_TXT);
  });

  // ── /v1/origin/pubkey (free — mounted before payment middleware) ───────────
  app.get('/v1/origin/pubkey', async (_req, res) => {
    const { getPubkeyInfo } = await import('./lib/sign.js');
    try {
      const info = await getPubkeyInfo();
      return res.json({ success: true, ...info });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Payment rails — mounted on /v1 (paid endpoints) ───────────────────────
  app.use('/v1', x402Middleware, mppMiddleware);

  // ── Origin routes ──────────────────────────────────────────────────────────
  app.use('/v1/origin', originRouter);

  // ── 404 catch-all ─────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error:   'Not found',
      code:    'NOT_FOUND',
    });
  });

  // ── Error handler ──────────────────────────────────────────────────────────
  // Express 5 passes errors to 4-argument handlers
  app.use((err, _req, res, _next) => {
    console.error('[hiveorigin] unhandled error:', err.message);
    res.status(500).json({
      success: false,
      error:   'Internal server error',
      code:    'INTERNAL_ERROR',
    });
  });

  return app;
}
