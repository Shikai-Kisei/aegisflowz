import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { redactSensitiveText, shouldBlockPrompt } from './guardrails.js';
import { estimateUsage, estimateCostUsd } from './usage.js';

interface Config {
  host: string;
  port: number;
  upstreamUrl: URL;
  apiKey?: string;
  databasePath: string;
}

interface ChatMessage { role?: string; content?: unknown }
interface ChatRequest { model?: string; messages?: ChatMessage[]; stream?: boolean }

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const upstream = new URL(env.AEGISFLOW_UPSTREAM_URL ?? 'https://api.openai.com');
  if (!['https:', 'http:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.search || upstream.hash) {
    throw new Error('AEGISFLOW_UPSTREAM_URL must be an HTTP(S) base URL without credentials, query, or fragment');
  }
  if (upstream.pathname !== '/') throw new Error('AEGISFLOW_UPSTREAM_URL must be an origin, without a path');
  const port = Number(env.AEGISFLOW_PORT ?? 4318);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('AEGISFLOW_PORT must be a valid TCP port');
  return {
    host: env.AEGISFLOW_HOST ?? '127.0.0.1',
    port,
    upstreamUrl: upstream,
    ...(env.AEGISFLOW_API_KEY ? { apiKey: env.AEGISFLOW_API_KEY } : {}),
    databasePath: resolve(env.AEGISFLOW_DB_PATH ?? '.aegisflow/traces.sqlite')
  };
}

function extractPrompt(body: ChatRequest): string {
  return (body.messages ?? []).map((message) => typeof message.content === 'string' ? message.content : '').join('\n');
}

function safeJson(value: unknown): string {
  try { return JSON.stringify(value); } catch { return '{}'; }
}

export function createApp(config = loadConfig(), db?: Database.Database): FastifyInstance {
  const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });
  mkdirSync(dirname(config.databasePath), { recursive: true });
  const database = db ?? new Database(config.databasePath);
  database.pragma('journal_mode = WAL');
  database.exec(`CREATE TABLE IF NOT EXISTS traces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    model TEXT,
    status INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    prompt_tokens_estimate INTEGER NOT NULL,
    completion_tokens_estimate INTEGER NOT NULL,
    cost_usd_estimate REAL NOT NULL,
    request_json TEXT NOT NULL,
    response_excerpt TEXT NOT NULL
  )`);
  const insertTrace = database.prepare(`INSERT INTO traces
    (model, status, duration_ms, prompt_tokens_estimate, completion_tokens_estimate, cost_usd_estimate, request_json, response_excerpt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  app.addHook('onClose', async () => { if (!db) database.close(); });
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/', async (_request, reply) => reply.type('text/html').send(`<!doctype html><meta charset="utf-8"><title>AegisFlow</title><style>body{font:16px system-ui;max-width:760px;margin:4rem auto;padding:0 1rem;color:#172033}code{background:#eef;padding:.2rem .4rem}a{color:#3157c8}</style><h1>🛡️ AegisFlow</h1><p>Your local AI traffic proxy is running.</p><p>Configure OpenAI-compatible clients with <code>http://localhost:${config.port}/v1</code>.</p><p><a href="/api/traces">View recent traces (JSON)</a></p>`));
  app.get('/api/traces', async () => database.prepare('SELECT id, created_at, model, status, duration_ms, prompt_tokens_estimate, completion_tokens_estimate, cost_usd_estimate FROM traces ORDER BY id DESC LIMIT 100').all());

  app.post<{ Body: ChatRequest }>('/v1/chat/completions', async (request, reply) => {
    const started = Date.now();
    const body = request.body ?? {};
    const model = body.model ?? 'unknown';
    const prompt = extractPrompt(body);
    const safePrompt = redactSensitiveText(prompt);
    if (shouldBlockPrompt(safePrompt)) {
      reply.code(403);
      return { error: { message: 'Request blocked by AegisFlow local prompt safety heuristic.', type: 'aegisflow_policy_violation' } };
    }

    const sanitizedBody = structuredClone(body) as ChatRequest;
    if (sanitizedBody.messages) {
      sanitizedBody.messages = sanitizedBody.messages.map((message) => ({
        ...message,
        content: typeof message.content === 'string' ? redactSensitiveText(message.content) : message.content
      }));
    }
    const promptEstimate = estimateUsage(safePrompt).tokens;
    const target = new URL('/v1/chat/completions', config.upstreamUrl);
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === 'string' && !['host', 'connection', 'content-length', 'authorization'].includes(key.toLowerCase())) headers.set(key, value);
    }
    const incomingAuthorization = request.headers.authorization;
    if (config.apiKey) headers.set('authorization', `Bearer ${config.apiKey}`);
    else if (typeof incomingAuthorization === 'string') headers.set('authorization', incomingAuthorization);
    headers.set('content-type', 'application/json');

    const abort = new AbortController();
    reply.raw.once('close', () => { if (!reply.raw.writableEnded) abort.abort(); });
    let status = 502;
    let responseExcerpt = '';
    let completionEstimate = 0;
    try {
      const upstreamResponse = await fetch(target, {
        method: 'POST', headers, body: JSON.stringify(sanitizedBody), signal: abort.signal
      });
      status = upstreamResponse.status;
      reply.code(status);
      const contentType = upstreamResponse.headers.get('content-type');
      if (contentType) reply.header('content-type', contentType);
      for (const name of ['cache-control', 'x-request-id', 'openai-organization', 'openai-processing-ms']) {
        const value = upstreamResponse.headers.get(name);
        if (value) reply.header(name, value);
      }
      if (upstreamResponse.body) {
        const reader = upstreamResponse.body.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            if (responseExcerpt.length < 65536) responseExcerpt += chunk.slice(0, 65536 - responseExcerpt.length);
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data: ') || line.trim() === 'data: [DONE]') continue;
              try {
                const event = JSON.parse(line.slice(6)) as { usage?: { completion_tokens?: number } };
                if (event.usage?.completion_tokens) completionEstimate = event.usage.completion_tokens;
              } catch { /* Partial or non-JSON SSE frame; continue streaming unchanged. */ }
            }
            if (!reply.raw.write(value)) await new Promise<void>((resolveDrain) => reply.raw.once('drain', resolveDrain));
          }
        } finally { reader.releaseLock(); }
      }
      reply.raw.end();
      return reply;
    } catch (error) {
      if (abort.signal.aborted) return reply;
      request.log.error({ err: error }, 'Upstream request failed');
      if (!reply.sent) return reply.code(502).send({ error: { message: 'Upstream request failed', type: 'aegisflow_upstream_error' } });
      return reply;
    } finally {
      const usage = estimateUsage(responseExcerpt);
      completionEstimate ||= usage.tokens;
      insertTrace.run(model, status, Date.now() - started, promptEstimate, completionEstimate,
        estimateCostUsd(model, promptEstimate, completionEstimate), safeJson({ ...sanitizedBody, messages: undefined }), responseExcerpt.slice(0, 4096));
    }
  });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const app = createApp(config);
  app.listen({ host: config.host, port: config.port }).catch((error: unknown) => { app.log.error(error); process.exit(1); });
}
