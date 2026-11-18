# AegisFlow 🛡️

AegisFlow is an open-source, self-hosted, local-first AI traffic proxy. This initial release provides an OpenAI-compatible chat-completions gateway, local SQLite trace metadata, basic redaction, and a small dashboard endpoint.

> **Security and accuracy note:** prompt screening is a small local heuristic, not a comprehensive prompt-injection detector. Token counts are estimates unless the upstream sends usage in its stream; cost estimates cover only the listed model prices. Review your policies before using this as a security boundary.

## Quick start

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run build
npm start
```

The proxy listens on `http://127.0.0.1:4318` and forwards to `https://api.openai.com` by default. Configure a client to use `http://localhost:4318/v1`. Either provide the upstream key as `AEGISFLOW_API_KEY`, or pass the normal provider authorization header through your SDK. To use another compatible provider, set `AEGISFLOW_UPSTREAM_URL` to its HTTP(S) origin. The destination is fixed by trusted process configuration; it is never selected by a request.

```bash
cp .env.example .env
# Edit .env, then:
npm run dev
```

Docker Compose is also supported: set `AEGISFLOW_API_KEY` in your environment and run `docker compose up --build`. The dashboard landing page is at `http://localhost:4318`; recent trace metadata is available at `/api/traces`.

## CLI

The workspace package contains `aegisflow init` and `aegisflow doctor` commands. From this checkout run `npm exec --workspace @aegisflow/cli -- aegisflow doctor` after building the CLI. The npm package publishing and bundled one-command install flow are not yet configured.

## Current scope

- `POST /v1/chat/completions` request forwarding, including streaming response passthrough with backpressure and client-disconnect cancellation.
- Common API-key and email redaction in prompt message text before forwarding.
- Conservative phrase-based prompt screening.
- Local SQLite trace summaries, latency and approximate token/cost fields.
- `GET /health`, `GET /api/traces` and a minimal local landing page.

MCP interception, human approval workflows, exact tokenization, replay, ONNX classification, PostgreSQL, OTLP export, and the full Next.js dashboard are planned, not implemented in this scaffold. Do not send sensitive production traffic without reviewing the proxy and threat model.

## Development

```bash
npm test
npm run typecheck
npm run build
```

Contributions should include tests for changed behavior. See `.coderabbit.yaml` for security review focus areas.
