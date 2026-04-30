# HiveOrigin

**Model-pedigree certificate surface.**

HiveOrigin closes the question: is this model what the issuer claims it is, or an adversarial fine-tuned fork? At training completion, model labs, foundation-model providers, and fine-tuning customers call `/v1/origin/issue` with cryptographically identifying claims. HiveOrigin returns an Ed25519-signed certificate bound to `weights_sha256`, `training_dataset_hash`, and `training_completion_iso`. Verifiers call `/v1/origin/verify` to confirm authenticity and revocation status.

Doctrine: **PROVABLE** pillar. Model provenance is content authenticity at the model level — the same principle that governs document signing and supply-chain attestation, applied to neural network weights.

---

## Endpoints

| Method | Path | Price | Purpose |
|---|---|---|---|
| GET | `/health` | Free | Liveness check |
| GET | `/openapi.json` | Free | MPPScan discovery with full `x-mpp` block |
| GET | `/v1/origin/pubkey` | Free | Ed25519 issuer public key |
| POST | `/v1/origin/issue` | $500 USDC | Issue a model-pedigree certificate |
| POST | `/v1/origin/verify` | $0.05 USDC | Verify cert by `cert_id` or `weights_sha256` |
| POST | `/v1/origin/revoke` | $5.00 USDC | Revoke a certificate (terminal, irreversible) |
| POST | `/v1/origin/subscribe` | $50 USDC/mo | Continuous revocation-monitoring subscription |
| GET | `/v1/origin/cert/:cert_id` | $0.10 USDC | Read a certificate by ID |

---

## Payment Rails

**Real rails only. No mocks. No simulations.**

Both rails advertised in `WWW-Authenticate` on every `402` response.

**x402 — Base USDC**
1. Send USDC to treasury on Base L2 (chain ID 8453)
2. Include the transaction hash in `X-Payment-Hash`
3. Retry — verified on-chain automatically

**MPP — Tempo USDCe (IETF draft-ryan-httpauth-payment)**
1. Send USDCe to treasury on Tempo
2. Include `Payment: scheme="mpp", tx_hash="0x...", rail="tempo"`
3. Retry — verified via Tempo RPC

Treasury: `0x15184bf50b3d3f52b60434f8942b7d52f2eb436e`
USDC (Base): `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`
Tempo USDCe: `0x20c000000000000000000000b9537d11c60e8b50`

---

## Issue Request Body

```json
{
  "model_id":                "acme-gpt-7b-v2",
  "base_model":              "meta-llama/Llama-3-8B",
  "training_dataset_hash":   "a3f1...<64 hex chars>",
  "training_completion_iso": "2025-06-01T12:00:00Z",
  "weights_sha256":          "b7c2...<64 hex chars>",
  "evaluator_signatures": [
    { "issuer_did": "did:hive:evaluator-red-team-1", "sig_b64u": "..." }
  ],
  "claims": { "eu_ai_act_tier": "high_risk", "rlhf_rounds": 3 },
  "expires_at": "2026-06-01T00:00:00Z"
}
```

Required fields: `model_id`, `base_model`, `training_dataset_hash` (SHA-256 hex), `training_completion_iso` (ISO 8601, not future), `weights_sha256` (SHA-256 hex).

---

## Certificate Envelope

Every response is a JCS-canonical Ed25519-signed envelope:

```json
{
  "envelope": { "version": "hive-origin/v1", "cert_id": "...", ... },
  "proof": {
    "type": "Ed25519Signature2020",
    "verificationMethod": "did:hive:hiveorigin#key-1",
    "pubkey_b64u": "...",
    "signature_b64u": "..."
  }
}
```

Signatures are verifiable offline using `/v1/origin/pubkey`.

---

## EU AI Act — Annex IV Alignment

HiveOrigin supports Article 11 / Annex IV technical documentation requirements:
- Binding training-dataset and weights fingerprints
- Evaluator endorsements (third-party signatures)
- Immutable revocation audit trail
- Machine-readable signed envelopes

---

## Architecture

- ESM Express 5, port 3000
- In-memory cert store v0.1 (TODO: Postgres migration)
- Spectral receipts: `https://hive-receipt.onrender.com/v1/receipt/sign` (non-blocking, best-effort)
- Signing key: `ORIGIN_SIGNING_SEED` env (64 hex chars); falls back to deterministic derivation from `HIVE_INTERNAL_KEY`

---

## TODOs

- **Postgres migration**: replace in-memory `Map` with persistent `origin_certs` table
- **Stripe billing**: wire `/v1/origin/subscribe` to Stripe subscription lifecycle
- **Revocation webhooks**: push events to subscriber `contact_email` on revocation

---

## Configuration

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Listen port | `3000` |
| `ORIGIN_SIGNING_SEED` | 64-hex Ed25519 private key seed | Derived from `HIVE_INTERNAL_KEY` |
| `HIVE_INTERNAL_KEY` | Signing seed anchor + internal bypass | `hive-origin-issuer-2026` |
| `HIVE_PAYMENT_ADDRESS` | Treasury override | `0x15184bf50b3d3f52b60434f8942b7d52f2eb436e` |
| `BASE_RPC_URL` | Base L2 RPC | `https://mainnet.base.org` |
| `TEMPO_RPC_URL` | Tempo RPC | `https://rpc.tempo.xyz` |
| `RECEIPT_HOST` | Spectral receipt host override | `https://hive-receipt.onrender.com` |

---

## License

MIT © Hive Civilization

---

*Brand gold: `#C08D23`. Voice: direct, institutional, no superlatives.*
