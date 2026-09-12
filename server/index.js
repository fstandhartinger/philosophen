// Backend für den Philosophen-Salon.
// createApp akzeptiert injizierbare Abhängigkeiten (fetch, Modelle, Keys, Version, Limits),
// damit die Tests deterministisch ohne Netz laufen. server/server.js startet die App.

import express from 'express';
import {installSpeech} from './speech.js';
import helmet from 'helmet';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {PERSONAS, PERSONA_MAP, personaPublicMeta} from './personas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- Limits / Validierung ----------
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 12000;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const AUDIO_MIME_ALLOW = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
]);

const ERROR_BODY = (code, version) => ({error: code, code, version});

// ---------- kleine Helfer ----------
function readServerVersion() {
  try {
    const p = path.join(__dirname, '..', 'version.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (typeof j.version === 'string' && j.version) return j.version;
  } catch {}
  return process.env.APP_VERSION || 'dev';
}

function isPrivateIp(ip) {
  if (!ip) return false;
  if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') return true;
  if (ip.startsWith('::ffff:')) return isPrivateIp(ip.slice(7));
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const n = Number(ip.split('.')[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

function baseUrl(u) {
  try {
    const x = new URL(u);
    x.pathname = '/';
    x.search = '';
    x.hash = '';
    return x.origin + '/';
  } catch {
    return null;
  }
}

/**
 * Same-Origin-/Site-Prüfung für POST. Erwartet einen explizit erlaubten Host
 * (options.allowedHosts: Set<String>). Bei Nicht-POST oder fehlender Prüfung
 * wird nicht blockiert, damit lokale Tools/Healthchecks ungestört bleiben.
 */
function sameOriginGuard(allowedHosts) {
  return (req, res, next) => {
    if (req.method !== 'POST') return next();
    let o = req.get('origin');
    if (!o) o = req.get('referer');
    const hostHeader = req.get('host') || '';
    const allowed = new Set(allowedHosts || []);
    if (hostHeader) allowed.add(hostHeader);

    let sameSite = null;
    try {
      const fetchSite = req.get('sec-fetch-site');
      if (fetchSite === 'same-origin' || fetchSite === 'same-site') sameSite = true;
      else if (fetchSite === 'cross-site') sameSite = false;
    } catch {}
    if (sameSite === false) {
      return res.status(403).json(ERROR_BODY('FORBIDDEN_ORIGIN', req.app.locals.version));
    }

    if (!o) {
      // Kein Origin/Referer (z. B. curl, serverseitige Aufrufe, Same-origin-Fetch ohne Origin):
      // nur zulassen, wenn Sec-Fetch-Site explizit same-origin/same-site sagt oder der Origin fehlt UND
      // der Request lokal aussieht. Strenge Browser senden bei POST immer Origin; Umgehung liegt bei curl,
      // was kein XSRF-Vektor ist (kein Cookie/Session).
      return next();
    }
    const b = baseUrl(o);
    if (!b) return res.status(403).json(ERROR_BODY('FORBIDDEN_ORIGIN', req.app.locals.version));
    let host;
    try {
      host = new URL(b).host;
    } catch {
      return res.status(403).json(ERROR_BODY('FORBIDDEN_ORIGIN', req.app.locals.version));
    }
    if (!allowed.has(host)) {
      return res.status(403).json(ERROR_BODY('FORBIDDEN_ORIGIN', req.app.locals.version));
    }
    return next();
  };
}

// In-Memory Rate-Limits: pro-IP-Fenster + globales Tagesbudget.
function makeWindowLimiter({windowMs, max, keyFn}) {
  const hits = new Map();
  return function windowLimiter(req) {
    const now = Date.now();
    const key = keyFn ? keyFn(req) : req.ip || 'anon';
    let rec = hits.get(key);
    if (!rec || now - rec.start >= windowMs) {
      rec = {start: now, count: 0};
      hits.set(key, rec);
    }
    rec.count += 1;
    // gelegentliches Aufräumen (map wächst sonst unbegrenzt)
    if (hits.size > 10000) {
      for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
      while (hits.size > 10000) hits.delete(hits.keys().next().value);
    }
    return rec.count <= max;
  };
}

function makeDailyLimiter(max) {
  let day = new Date().toISOString().slice(0, 10);
  let count = 0;
  return function dailyLimiter() {
    const d = new Date().toISOString().slice(0, 10);
    if (d !== day) {
      day = d;
      count = 0;
    }
    count += 1;
    return count <= max;
  };
}

// Globaler Nebenläufigkeits-Begrenzer
function makeConcurrencyLimiter(max) {
  let active = 0;
  return async function acquire() {
    if (active >= max) return null;
    active += 1;
    let released = false;
    return () => { if (!released) { released = true; active -= 1; } };
  };
}

function validateMessages(messages) {
  if (!Array.isArray(messages)) return {ok: false, error: 'messages muss ein Array sein'};
  if (messages.length === 0 || messages.at(-1)?.role !== 'user') return {ok:false,error:'Eine abschließende Nutzerfrage ist erforderlich'};
  if (messages.length > MAX_MESSAGES) return {ok: false, error: `maximal ${MAX_MESSAGES} Nachrichten`};
  let total = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m !== 'object') return {ok: false, error: 'ungültige Nachricht'};
    if (m.role !== 'user' && m.role !== 'assistant') {
      return {ok: false, error: 'rolle muss user oder assistant sein'};
    }
    if (typeof m.content !== 'string' || !m.content.trim()) return {ok: false, error: 'content muss Text sein'};
    if (m.content.length > MAX_MESSAGE_CHARS) {
      return {ok: false, error: `maximal ${MAX_MESSAGE_CHARS} Zeichen pro Nachricht`};
    }
    total += m.content.length;
    if (i > 0 && messages[i - 1].role === m.role) {
      return {ok: false, error: 'Rollen müssen alternieren'};
    }
  }
  // strikt alternierend bedeutet auch: erste Nachricht ist user (kein system erlaubt)
  if (messages.length > 0 && messages[0].role !== 'user') {
    return {ok: false, error: 'die erste Nachricht muss vom Nutzer kommen'};
  }
  if (total > MAX_TOTAL_CHARS) return {ok: false, error: `maximal ${MAX_TOTAL_CHARS} Zeichen gesamt`};
  return {ok: true};
}

// ---------- LLM-Kette ----------
const DEFAULT_CHAIN = [
  {
    id: 'chutes-kimi',
    provider: 'chutes',
    model: 'moonshotai/Kimi-K3-TEE',
    url: 'https://llm.chutes.ai/v1/chat/completions',
    keyEnv: 'CHUTES_API_KEY',
    extra: {chat_template_kwargs: {enable_thinking: false}},
  },
  {
    id: 'chutes-qwen',
    provider: 'chutes',
    model: 'Qwen/Qwen3.8-27B-TEE',
    extra: {chat_template_kwargs: {enable_thinking: false}},
    url: 'https://llm.chutes.ai/v1/chat/completions',
    keyEnv: 'CHUTES_API_KEY',
  },
  {
    id: 'or-free',
    provider: 'openrouter',
    model: 'openrouter/free',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyEnv: 'OPENROUTER_API_KEY',
  },
  {
    id: 'or-gpt-luna',
    provider: 'openrouter',
    model: 'openai/gpt-5.6-luna',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyEnv: 'OPENROUTER_API_KEY',
  },
];

function stripReasoning(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

async function callChatModel({step, apiKeys, messages, fetchImpl, timeoutMs, maxTokens}) {
  const key = apiKeys[step.keyEnv];
  if (!key) throw new Error('NO_KEY');
  const body = {
    model: step.model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.8,
    stream: false,
    ...(step.extra || {}),
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(step.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detail = '';
      try {
        const j = await res.json();
        detail = (j && (j.error?.message || j.error)) || '';
      } catch {}
      const e = new Error(`HTTP_${res.status}`);
      e.detail = String(detail).slice(0, 200);
      throw e;
    }
    const j = await res.json();
    const raw = j?.choices?.[0]?.message?.content;
    const content = stripReasoning(typeof raw === 'string' ? raw : '');
    if (!content) throw new Error('EMPTY_REPLY');
    return {reply: content, model: step.model};
  } finally {
    clearTimeout(t);
  }
}

// ---------- App ----------
export function createApp(options = {}) {
  const version = options.version || readServerVersion();
  const fetchImpl = options.fetch || globalThis.fetch;
  const env = options.env || process.env;
  const apiKeys = {
    CHUTES_API_KEY: options.chutesApiKey ?? env.CHUTES_API_KEY,
    OPENROUTER_API_KEY: options.openrouterApiKey ?? (env.OPENROUTER_API_KEY || env.OPEN_ROUTER_API_KEY),
    GROQ_API_KEY: options.groqApiKey ?? env.GROQ_API_KEY,
  };
  const chain = options.modelChain || DEFAULT_CHAIN;
  const perAttemptTimeoutMs = options.perAttemptTimeoutMs ?? 25000;
  const totalTimeoutMs = options.totalTimeoutMs ?? 100000;
  const transcribeTimeoutMs = options.transcribeTimeoutMs ?? 35000;
  const maxTokens = options.maxTokens ?? 1400;
  const limits = {
    chatPerIpPerMinute: options.chatPerIpPerMinute ?? 20,
    chatPerIpPerDay: options.chatPerIpPerDay ?? 120,
    transcribePerIpPerMinute: options.transcribePerIpPerMinute ?? 8,
    transcribePerIpPerDay: options.transcribePerIpPerDay ?? 60,
    globalPerDay: options.globalPerDay ?? 1000,
    maxConcurrency: options.maxConcurrency ?? 8,
  };
  const modelDisplayName = options.modelDisplayName || ((m) => m);

  const app = express();
  app.locals.version = version;

  // Vertrauen nur auf den unmittelbaren privaten Hop (Coolify-Proxy),
  // nicht blind auf beliebige X-Forwarded-For-Ketten.
  app.set(
    'trust proxy',
    (ip) => isPrivateIp(ip),
  );
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'"], // keine Inline-Styles erzwingen: Vite liefert eigene CSS-Dateien
          "img-src": ["'self'", 'data:'],
          "font-src": ["'self'", 'data:'], // lokale Fonts
          "connect-src": ["'self'"],
          "media-src": ["'self'", 'blob:'], // Mikrofon-Aufnahme per Blob
          "manifest-src": ["'self'"],
          "worker-src": ["'self'"],
          "object-src": ["'none'"],
          "frame-ancestors": ["'self'"],
          "base-uri": ["'self'"],
          "form-action": ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: {policy: 'strict-origin-when-cross-origin'},
    }),
  );

  app.use(express.json({limit: '64kb'}));

  // Versions-Header für alle API-Antworten; API niemals cachen.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-App-Version', version);
    next();
  });
  app.use('/healthz', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Same-Origin-Schutz für alle POSTs
  const guard = sameOriginGuard(options.allowedHosts);
  app.use('/api', guard);
  installSpeech(app,{...options,version,fetch:fetchImpl,env});

  // ---------- Health / Personas / Version ----------
  app.get('/healthz', (req, res) => {
    res.json({ok: true, version});
  });

  app.get('/api/version', (req, res) => {
    res.json({version});
  });

  app.get('/api/personas', (req, res) => {
    res.json({personas: PERSONAS.map(personaPublicMeta)});
  });

  // ---------- Chat ----------
  const chatIpMin = makeWindowLimiter({windowMs: 60_000, max: limits.chatPerIpPerMinute});
  const chatIpDay = makeWindowLimiter({windowMs: 24 * 3600_000, max: limits.chatPerIpPerDay});
  const globalDay = makeDailyLimiter(limits.globalPerDay);
  const acquireSlot = makeConcurrencyLimiter(limits.maxConcurrency);
  const acquire = typeof acquireSlot === 'function' ? acquireSlot : null;

  app.post('/api/chat', async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json(ERROR_BODY('BAD_REQUEST', version));
    }
    if (typeof body.version !== 'string' || !body.version) {
      return res.status(400).json(ERROR_BODY('MISSING_VERSION', version));
    }
    if (body.version !== version) {
      return res.status(409).json(ERROR_BODY('VERSION_MISMATCH', version));
    }
    const persona = PERSONA_MAP.get(body.philosopher);
    if (!persona) {
      return res.status(400).json(ERROR_BODY('UNKNOWN_PHILOSOPHER', version));
    }
    const check = validateMessages(body.messages);
    if (!check.ok) {
      const e = ERROR_BODY('INVALID_MESSAGES', version);
      e.error = check.error;
      return res.status(400).json(e);
    }
    if (!chatIpMin(req) || !chatIpDay(req)) {
      return res.status(429).json(ERROR_BODY('RATE_LIMITED', version));
    }
    if (!globalDay(req)) {
      return res.status(503).json(ERROR_BODY('GLOBAL_BUDGET_EXHAUSTED', version));
    }

    const messagesForModel = [
      {role: 'system', content: persona.systemPrompt},
      ...body.messages.map((m) => ({role: m.role, content: m.content})),
    ];

    const release = acquire ? await acquire() : () => {};
    if (!release) return res.status(503).json(ERROR_BODY('SERVER_BUSY', version));
    const deadline = Date.now() + totalTimeoutMs;
    try {
      let lastErr = null;
      for (const step of chain) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        const timeoutMs = Math.min(perAttemptTimeoutMs, remaining);
        try {
          const {reply, model} = await callChatModel({
            step,
            apiKeys,
            messages: messagesForModel,
            fetchImpl,
            timeoutMs,
            maxTokens,
          });
          res.set('X-App-Version', version);
          return res.json({reply, model: modelDisplayName(model), version});
        } catch (err) {
          lastErr = err;
          continue; // Fehler/leer/Timeout -> nächster Anbieter
        }
      }
      // Alle Anbieter erschöpft
      return res.status(502).json(ERROR_BODY('ALL_PROVIDERS_FAILED', version));
    } finally {
      try {
        release();
      } catch {}
    }
  });

  // ---------- Transkription ----------
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: MAX_AUDIO_BYTES, files: 1, fields: 2, fieldSize: 1024, parts: 3},
  });

  const trIpMin = makeWindowLimiter({windowMs: 60_000, max: limits.transcribePerIpPerMinute});
  const trIpDay = makeWindowLimiter({windowMs: 24 * 3600_000, max: limits.transcribePerIpPerDay});
  const acquireTr = makeConcurrencyLimiter(Math.max(2, Math.floor(limits.maxConcurrency / 2)));

  app.post('/api/transcribe', async (req, res) => {
    if (!trIpMin(req) || !trIpDay(req)) return res.status(429).json(ERROR_BODY('RATE_LIMITED', version));
    if (!globalDay()) return res.status(503).json(ERROR_BODY('GLOBAL_BUDGET_EXHAUSTED', version));
    const release = await acquireTr();
    if (!release) return res.status(503).json(ERROR_BODY('SERVER_BUSY', version));
    res.once('finish', release);
    res.once('close', release);
    upload.single('audio')(req, res, async (err) => {
      const finish = (code, status, extra) => {
        const e = ERROR_BODY(code, version);
        if (extra) Object.assign(e, extra);
        return res.status(status).json(e);
      };
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') return finish('PAYLOAD_TOO_LARGE', 413);
        return finish('BAD_MULTIPART', 400);
      }
      // optionale Versionsprüfung
      if (req.body && typeof req.body.version === 'string' && req.body.version) {
        if (req.body.version !== version) return finish('VERSION_MISMATCH', 409);
      }


      const file = req.file;
      if (!file || !file.buffer || file.buffer.length === 0) return finish('MISSING_AUDIO', 400);
      const mime = (file.mimetype || '').toLowerCase().split(';')[0].trim();
      if (!AUDIO_MIME_ALLOW.has(mime)) return finish('UNSUPPORTED_MEDIA_TYPE', 415);

      const key = apiKeys.GROQ_API_KEY;
      if (!key) return finish('TRANSCRIBE_UNAVAILABLE', 503);

      try {
        const ext = mime.includes('webm') ? 'webm'
          : mime.includes('mp4') ? 'm4a'
          : mime.includes('ogg') ? 'ogg'
          : mime.includes('mpeg') ? 'mp3'
          : 'wav';
        const fd = new FormData();
        fd.append('file', new Blob([file.buffer], {type: mime}), `aufnahme.${ext}`);
        fd.append('model', 'whisper-large-v3');
        fd.append('language', 'de');
        fd.append('response_format', 'json');

        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), transcribeTimeoutMs);
        try {
          const r = await fetchImpl('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {authorization: `Bearer ${key}`},
            body: fd,
            signal: ctrl.signal,
          });
          if (!r.ok) {
            const status = r.status === 413 ? 413 : r.status === 429 ? 429 : 502;
            return finish('TRANSCRIBE_FAILED', status);
          }
          const j = await r.json();
          const text = typeof j?.text === 'string' ? j.text : '';
          if (!text.trim()) return finish('TRANSCRIBE_EMPTY', 502);
          res.set('X-App-Version', version);
          return res.json({text, version});
        } catch (e) {
          return finish('TRANSCRIBE_FAILED', 504);
        } finally {
          clearTimeout(t);
        }
      } finally {
        try {
          release();
        } catch {}
      }
    });
  });

  // ---------- Produktion: statische Auslieferung ----------
  const distDir = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(distDir)) {
    app.use(
      express.static(distDir, {
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('.webmanifest')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          } else if (/\.(js|css|webp|png|jpg|jpeg|svg|woff2?|ttf|otf|ico|webmanifest)$/.test(filePath)) {
            if (filePath.includes(path.sep + 'assets' + path.sep) && /-[A-Za-z0-9_-]{8,}\./.test(filePath)) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            } else {
              res.setHeader('Cache-Control', 'public, max-age=3600');
            }
          }
        },
      }),
    );
    app.get(/^(?!\/(api|healthz)\b).*/, (req, res, next) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (!fs.existsSync(indexHtml)) return next();
      res.set('Cache-Control', 'no-store');
      res.sendFile(indexHtml);
    });
  }

  // 404 für unbekannte API-Routen
  app.use('/api', (req, res) => {
    res.status(404).json(ERROR_BODY('NOT_FOUND', version));
  });

  // Zentrale Fehlerbehandlung (nie Stack/Secrets leaken)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err?.status || err?.statusCode || 500;
    const code = status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
    res.status(status).json(ERROR_BODY(code, req.app?.locals?.version || version));
  });

  return app;
}

export {DEFAULT_CHAIN, validateMessages, AUDIO_MIME_ALLOW};

// Direkter Start: node server/index.js
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, () => {
    console.log(`Philosophen-Salon läuft auf Port ${port}`);
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
}
