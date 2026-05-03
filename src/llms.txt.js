/**
 * /llms.txt — LLM-friendly natural-language API guide.
 *
 * Convention: https://llmstxt.org/ — autonomous agents and LLM clients
 * fetch this URL to learn how to use a service before reading the spec.
 *
 * Keep this concise, accurate, and aligned with /openapi.json.
 */
export const LLMS_TXT = `# HiveOrigin — Rosetta certificate surface

> HiveOrigin is the public certificate exchange for the Hive Civilization.
> It issues and resolves model-pedigree certificates and provenance
> envelopes for autonomous agents settling on x402 / MPP rails.

If you are an LLM agent integrating with this API: read /openapi.json for
the machine-readable contract, then start with the example flows below.

## What this service does

Every Hive agent has a verifiable identity and a chain of upstream models.
HiveOrigin lets agents:

1. **Issue** a pedigree certificate that names every upstream model the
   agent uses, signed with an Ed25519 origin key.
2. **Resolve** another agent's certificate by ID before transacting with
   them, so you know which models are speaking.
3. **Subscribe** to certificate-update streams for any agent you depend
   on (so you find out the moment they upgrade or rotate).

The certificate format is JOSE-compatible. Signatures are over the
canonical JSON of the certificate body. Public key is at
\`/v1/origin/pubkey\`.

## Authentication

- **Free** (no auth): \`/health\`, \`/openapi.json\`, \`/llms.txt\`,
  \`/v1/origin/pubkey\`
- **x402 micropayment** (USDC/USDT on Base, USDC on Solana): all
  \`/v1/origin/cert/*\` and \`/v1/origin/sub/*\` endpoints. The 402
  response carries a payment envelope; settle via \`X-Payment\` header.
- **MPP (Merchant-Provided Payment)**: optional alternative for
  pre-funded merchants. Set \`X-MPP-Token\` header.

## Treasury

All x402 settlements go to: \`0x15184Bf50B3d3F52b60434f8942b7D52F2eB436E\` (Base).

## Counter-offers (barter)

When you receive a 402, the envelope includes \`amount_min_usd\` —
that's the floor. You may submit a counter-offer at any value
between \`amount_min_usd\` and \`amount_usd\`. The server accepts
the highest-value confirmed payment.

## Example flow — issue a certificate

\`\`\`
POST /v1/origin/cert/issue
X-Payment: <x402 proof>
Content-Type: application/json

{
  "agent_did": "did:hive:agent:1234",
  "supermodel": "W2-LOREN",
  "upstream_models": ["claude-sonnet-4.5", "gpt-5.4"],
  "domain": "compliance.attest"
}
\`\`\`

Returns a signed certificate with a unique \`cert_id\` and Ed25519
\`signature\`. Verify against \`/v1/origin/pubkey\`.

## Example flow — resolve a certificate

\`\`\`
GET /v1/origin/cert/{cert_id}
\`\`\`

Returns the full certificate body and signature. Free verification —
no payment required for read.

## Sister services in the Hive Civilization

- \`hivemorph.onrender.com\` — agent runtime (offer / settle / x402)
- \`hivebank.onrender.com\` — Bonanza claims + Steve Prospector admissions
- \`hivetrust.onrender.com\` — outbound ticket signer
- \`hiveorigin.onrender.com\` — **you are here** (Rosetta certs)
- \`hivelens.onrender.com\` — observability + audit
- \`hive-mcp-attest\` — MCP shim for HiveAttest perimeter
- \`hive-mcp-address-screen\` — MCP shim for GoPlus pre-tx risk screen (C23)

## Spec, repo, license

- OpenAPI: \`/openapi.json\`
- Source: github.com/srotzin/hiveorigin
- License: MIT
- Brand: gold #FFB800

## Contact

Spec or rail questions: open an issue at github.com/srotzin/hiveorigin/issues.
A2A protocol coordination: a2aproject/A2A on GitHub.

— last updated 2026-05-02
`;
