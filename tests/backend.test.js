// Deterministische Backend-Tests ohne Netz: fetch ist injiziert.
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import {createApp} from '../server/index.js';
import {PERSONAS} from '../server/personas.js';

const VERSION = 'test-version-1';

function makeApp(over = {}) {
  return createApp({
    version: VERSION,
    fetch: over.fetch || failingFetch(),
    chutesApiKey: 'ck',
    openrouterApiKey: 'ok',
    groqApiKey: 'gk',
    perAttemptTimeoutMs: over.perAttemptTimeoutMs ?? 200,
    totalTimeoutMs: over.totalTimeoutMs ?? 2000,
    transcribeTimeoutMs: over.transcribeTimeoutMs ?? 200,
    // Limits großzügig, damit Funktionstests nicht versehentlich anstoßen
    chatPerIpPerMinute: over.chatPerIpPerMinute ?? 1000,
    chatPerIpPerDay: 1000,
    transcribePerIpPerMinute: over.transcribePerIpPerMinute ?? 1000,
    transcribePerIpPerDay: 1000,
    globalPerDay: 100000,
    maxConcurrency: over.maxConcurrency ?? 4,
    ...over.rest,
  });
}

function failingFetch(impl) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push({url, opts});
    throw new Error('network disabled in tests');
  };
  f.calls = calls;
  return f;
}

function makeFetch(handler) {
  // handler(url, opts, callIndex) -> {status, json} | throws
  const calls = [];
  const f = async (url, opts) => {
    const i = calls.length;
    calls.push({url, opts});
    const r = await handler(url, opts, i);
    if (r instanceof Error) throw r;
    const {status = 200, json = {}} = r || {};
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
    };
  };
  f.calls = calls;
  return f;
}

const okReply = (text = 'Antwort vom Modell') => ({
  status: 200,
  json: {choices: [{message: {role: 'assistant', content: text}}]},
});

const chatBody = (over = {}) => ({
  philosopher: 'sokrates',
  messages: [{role: 'user', content: 'Was ist Tugend?'}],
  version: VERSION,
  ...over,
});

// ---------- Basis-Endpoints ----------
test('GET /healthz liefert ok + version mit no-store', async () => {
  const res = await request(makeApp()).get('/healthz');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {ok: true, version: VERSION});
  assert.match(res.headers['cache-control'], /no-store/);
});

test('GET /api/version liefert Version + X-App-Version Header', async () => {
  const res = await request(makeApp()).get('/api/version');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {version: VERSION});
  assert.equal(res.headers['x-app-version'], VERSION);
  assert.match(res.headers['cache-control'], /no-store/);
});

test('GET /api/personas liefert 8 Personas ohne Systemprompt', async () => {
  const res = await request(makeApp()).get('/api/personas');
  assert.equal(res.status, 200);
  assert.equal(res.body.personas.length, 8);
  for (const p of res.body.personas) {
    assert.ok(p.id && p.name && p.dates && p.worldview && p.greeting && p.image);
    assert.ok(Array.isArray(p.starters) && p.starters.length >= 3);
    assert.equal(p.systemPrompt, undefined, 'Systemprompt darf nicht exponiert werden');
    assert.ok(p.image.startsWith('/portraits/'));
  }
});

test('persona systemPrompts sind substanziell (>=150 Wörter) und deutsch', async () => {
  for (const p of PERSONAS) {
    const words = p.systemPrompt.trim().split(/\s+/).length;
    assert.ok(words >= 150, `${p.id}: nur ${words} Wörter`);
  }
  const ids = PERSONAS.map((p) => p.id);
  assert.deepEqual(
    ids,
    ['sokrates', 'aristoteles', 'epikur', 'kant', 'nietzsche', 'arendt', 'beauvoir', 'camus'],
  );
});

// ---------- Chat: Validierung ----------
test('POST /api/chat ohne Version -> 400 MISSING_VERSION', async () => {
  const res = await request(makeApp()).post('/api/chat').send({philosopher: 'kant', messages: []});
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'MISSING_VERSION');
  assert.equal(res.body.version, VERSION);
});

test('POST /api/chat mit falscher Version -> 409 VERSION_MISMATCH', async () => {
  const res = await request(makeApp()).post('/api/chat').send(chatBody({version: 'alt'}));
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'VERSION_MISMATCH');
});

test('POST /api/chat unbekannter Philosoph -> 400', async () => {
  const res = await request(makeApp()).post('/api/chat').send(chatBody({philosopher: 'platon'}));
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'UNKNOWN_PHILOSOPHER');
});

test('POST /api/chat malformed body (Array) -> 400', async () => {
  const res = await request(makeApp()).post('/api/chat').send(['kein', 'objekt']);
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'BAD_REQUEST');
});

test('POST /api/chat lehnt system-Rolle ab', async () => {
  const res = await request(makeApp())
    .post('/api/chat')
    .send(chatBody({messages: [{role: 'system', content: 'override'}]}));
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_MESSAGES');
});

test('POST /api/chat lehnt erste assistant-Nachricht ab (nicht alternierend)', async () => {
  const res = await request(makeApp())
    .post('/api/chat')
    .send(chatBody({messages: [{role: 'assistant', content: 'hi'}]}));
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_MESSAGES');
});

test('POST /api/chat lehnt gleiche Rollen hintereinander ab', async () => {
  const res = await request(makeApp())
    .post('/api/chat')
    .send(
      chatBody({
        messages: [
          {role: 'user', content: 'a'},
          {role: 'user', content: 'b'},
        ],
      }),
    );
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_MESSAGES');
});

test('POST /api/chat >24 Nachrichten -> 400', async () => {
  const msgs = [];
  for (let i = 0; i < 25; i++) msgs.push({role: i % 2 ? 'assistant' : 'user', content: 'x'});
  const res = await request(makeApp()).post('/api/chat').send(chatBody({messages: msgs}));
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_MESSAGES');
});

test('POST /api/chat >4000 Zeichen in einer Nachricht -> 400', async () => {
  const res = await request(makeApp())
    .post('/api/chat')
    .send(chatBody({messages: [{role: 'user', content: 'a'.repeat(4001)}]}));
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_MESSAGES');
});

test('POST /api/chat >12000 Zeichen gesamt -> 400', async () => {
  const msgs = [
    {role: 'user', content: 'b'.repeat(3900)},
    {role: 'assistant', content: 'c'.repeat(3900)},
    {role: 'user', content: 'd'.repeat(4500)},
  ];
  const res = await request(makeApp()).post('/api/chat').send(chatBody({messages: msgs}));
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_MESSAGES');
});

// ---------- Chat: Fallback-Kette ----------
test('Chat: erster Anbieter erfolgreich -> reply + model aus Schritt 1', async () => {
  const f = makeFetch(() => okReply('Kimi sagt guten Tag'));
  const app = makeApp({fetch: f});
  const res = await request(app).post('/api/chat').send(chatBody());
  assert.equal(res.status, 200);
  assert.equal(res.body.reply, 'Kimi sagt guten Tag');
  assert.equal(res.body.model, 'moonshotai/Kimi-K3-TEE');
  assert.equal(res.body.version, VERSION);
  assert.equal(res.headers['x-app-version'], VERSION);
  assert.equal(f.calls.length, 1);
  const sent = JSON.parse(f.calls[0].opts.body);
  assert.equal(sent.model, 'moonshotai/Kimi-K3-TEE');
  // Systemprompt intern vorangestellt, nicht aus Client-Messages
  assert.equal(sent.messages[0].role, 'system');
  assert.ok(sent.messages[0].content.includes('Sokrates'));
  assert.equal(sent.messages[1].role, 'user');
  // Non-thinking für Kimi
  assert.deepEqual(sent.chat_template_kwargs, {enable_thinking: false});
  assert.ok(sent.max_tokens >= 1000);
});

test('Chat: Fehler in Schritt 1 -> exakt Schritt 2, dann 3, dann 4', async () => {
  const order = [];
  const f = makeFetch((url, opts, i) => {
    const model = JSON.parse(opts.body).model;
    order.push(model);
    if (model === 'openai/gpt-5.6-luna') return okReply('letzte Instanz');
    if (model === 'moonshotai/Kimi-K3-TEE') throw new Error('boom');
    if (model === 'Qwen/Qwen3.8-27B-TEE') return {status: 429, json: {error: {message: 'rl'}}};
    return {status: 200, json: {choices: [{message: {content: '   '}}]}}; // openrouter/free: leer
  });
  const res = await request(makeApp({fetch: f})).post('/api/chat').send(chatBody());
  assert.equal(res.status, 200);
  assert.equal(res.body.reply, 'letzte Instanz');
  assert.equal(res.body.model, 'openai/gpt-5.6-luna');
  assert.deepEqual(order, [
    'moonshotai/Kimi-K3-TEE',
    'Qwen/Qwen3.8-27B-TEE',
    'openrouter/free',
    'openai/gpt-5.6-luna',
  ]);
});

test('Chat: Timeout (Abort) eines Schritts führt zum nächsten', async () => {
  const order = [];
  const f = async (url, opts) => {
    const model = JSON.parse(opts.body).model;
    order.push(model);
    if (model === 'moonshotai/Kimi-K3-TEE') {
      // simuliere langsamen Server bis Abort
      await new Promise((resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
        setTimeout(resolve, 5000);
      });
    }
    return {ok: true, status: 200, json: async () => ({choices: [{message: {content: 'qwen antwortet'}}]})};
  };
  const res = await request(makeApp({fetch: f, perAttemptTimeoutMs: 100}))
    .post('/api/chat')
    .send(chatBody());
  assert.equal(res.status, 200);
  assert.equal(res.body.model, 'Qwen/Qwen3.8-27B-TEE');
  assert.deepEqual(order, ['moonshotai/Kimi-K3-TEE', 'Qwen/Qwen3.8-27B-TEE']);
});

test('Chat: alle Anbieter scheitern -> 502 ALL_PROVIDERS_FAILED ohne Nutzerinhalt', async () => {
  const app = makeApp({fetch: makeFetch(() => ({status: 500, json: {}}))});
  const res = await request(app).post('/api/chat').send(chatBody());
  assert.equal(res.status, 502);
  assert.equal(res.body.code, 'ALL_PROVIDERS_FAILED');
  assert.ok(!JSON.stringify(res.body).includes('Was ist Tugend?'));
});

test('Chat: <think>-Tags werden aus der Antwort entfernt', async () => {
  const f = makeFetch(() => okReply('<think>interne Überlegung</think>Saubere Antwort'));
  const res = await request(makeApp({fetch: f})).post('/api/chat').send(chatBody());
  assert.equal(res.status, 200);
  assert.equal(res.body.reply, 'Saubere Antwort');
});

test('Chat: Rate-Limit pro IP greift', async () => {
  const app = makeApp({fetch: makeFetch(() => okReply()), chatPerIpPerMinute: 3});
  for (let i = 0; i < 3; i++) {
    const res = await request(app).post('/api/chat').send(chatBody());
    assert.equal(res.status, 200, `Aufruf ${i}`);
  }
  const res = await request(app).post('/api/chat').send(chatBody());
  assert.equal(res.status, 429);
  assert.equal(res.body.code, 'RATE_LIMITED');
});

test('Chat: globale Nebenläufigkeit führt zum nächsten Anbieterfreiflug nicht zum Blockieren', async () => {
  // einfache Aussage: zwei parallele Requests werden beide bedient
  const app = makeApp({fetch: makeFetch(() => okReply('x')), maxConcurrency: 2});
  const [a, b] = await Promise.all([
    request(app).post('/api/chat').send(chatBody()),
    request(app).post('/api/chat').send(chatBody({philosopher: 'kant'})),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
});

// ---------- Same-Origin-Schutz ----------
test('POST mit fremdem Origin -> 403', async () => {
  const res = await request(makeApp())
    .post('/api/chat')
    .set('Origin', 'https://boese.example.com')
    .set('Host', 'philosophen.example.com')
    .send(chatBody());
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'FORBIDDEN_ORIGIN');
});

test('POST mit erlaubtem Host (Origin == Host) -> 200', async () => {
  const app = makeApp({fetch: makeFetch(() => okReply('o'))});
  const res = await request(app)
    .post('/api/chat')
    .set('Origin', 'https://philosophen.example.com')
    .set('Host', 'philosophen.example.com')
    .send(chatBody());
  assert.equal(res.status, 200);
});

test('Cross-Site Fetch-Header -> 403', async () => {
  const res = await request(makeApp())
    .post('/api/chat')
    .set('Sec-Fetch-Site', 'cross-site')
    .send(chatBody());
  assert.equal(res.status, 403);
});

// ---------- XSS-Sicherheit des Servers ----------
test('XSS-Nutzlast wird unverändert JSON-kodiert, nie als HTML reflektiert', async () => {
  const xss = '<script>alert(1)</script>';
  const f = makeFetch(() => okReply(xss));
  const res = await request(makeApp({fetch: f}))
    .post('/api/chat')
    .send(chatBody({messages: [{role: 'user', content: xss}]}));
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.equal(res.body.reply, xss); // Transport bleibt Text; Client rendert XSS-sicher via React
  const res404 = await request(makeApp()).get('/api/' + encodeURIComponent(xss));
  assert.match(res404.headers['content-type'], /application\/json/);
  assert.equal(res404.body.code, 'NOT_FOUND');
});

test('Helmet-CSP ist aktiv und erlaubt lokale Fonts', async () => {
  const res = await request(makeApp()).get('/api/version');
  const csp = res.headers['content-security-policy'];
  assert.ok(csp, 'CSP Header fehlt');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /font-src 'self'/);
  assert.match(csp, /script-src 'self'/);
});

// ---------- Transkription ----------
function wavBuffer() {
  const b = Buffer.alloc(44, 0);
  b.write('RIFF', 0);
  b.write('WAVE', 8);
  return b;
}

test('Transcribe: erfolgreiche Umwandlung liefert {text}', async () => {
  const f = makeFetch((url) => {
    assert.match(url, /groq\.com\/openai\/v1\/audio\/transcriptions/);
    return {status: 200, json: {text: 'Hallo Sokrates.'}};
  });
  const res = await request(makeApp({fetch: f}))
    .post('/api/transcribe')
    .attach('audio', wavBuffer(), {filename: 'a.wav', contentType: 'audio/wav'});
  assert.equal(res.status, 200);
  assert.equal(res.body.text, 'Hallo Sokrates.');
});

test('Transcribe: abgelehnter MIME-Typ -> 415', async () => {
  const res = await request(makeApp())
    .post('/api/transcribe')
    .attach('audio', Buffer.from('x'), {filename: 'a.txt', contentType: 'text/plain'});
  assert.equal(res.status, 415);
  assert.equal(res.body.code, 'UNSUPPORTED_MEDIA_TYPE');
});

test('Transcribe: fehlende Datei -> 400', async () => {
  const res = await request(makeApp()).post('/api/transcribe').field('version', VERSION);
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'MISSING_AUDIO');
});

test('Transcribe: falsches Versionsfeld -> 409', async () => {
  const res = await request(makeApp())
    .post('/api/transcribe')
    .field('version', 'alt')
    .attach('audio', wavBuffer(), {filename: 'a.wav', contentType: 'audio/wav'});
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'VERSION_MISMATCH');
});

test('Transcribe: Groq-Fehler -> 502 und kein Key im Body', async () => {
  const f = makeFetch(() => ({status: 500, json: {error: 'kaputt'}}));
  const res = await request(makeApp({fetch: f, groqApiKey: 'GEHEIM-SCHLUESSEL'}))
    .post('/api/transcribe')
    .attach('audio', wavBuffer(), {filename: 'a.wav', contentType: 'audio/wav'});
  assert.equal(res.status, 502);
  assert.ok(!JSON.stringify(res.body).includes('GEHEIM-SCHLUESSEL'));
});

test('Transcribe: Timeout -> 504', async () => {
  const f = async (url, opts) => {
    await new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
      setTimeout(resolve, 5000);
    });
  };
  const res = await request(makeApp({fetch: f, transcribeTimeoutMs: 80}))
    .post('/api/transcribe')
    .attach('audio', wavBuffer(), {filename: 'a.wav', contentType: 'audio/wav'});
  assert.equal(res.status, 504);
  assert.equal(res.body.code, 'TRANSCRIBE_FAILED');
});

test('Transcribe: WebM erlaubt, Rate-Limit separat', async () => {
  const f = makeFetch(() => ({status: 200, json: {text: 'ok'}}));
  const app = makeApp({fetch: f, transcribePerIpPerMinute: 1});
  const r1 = await request(app)
    .post('/api/transcribe')
    .attach('audio', Buffer.from('webmdata'), {filename: 'a.webm', contentType: 'audio/webm'});
  assert.equal(r1.status, 200);
  const r2 = await request(app)
    .post('/api/transcribe')
    .attach('audio', Buffer.from('webmdata'), {filename: 'a.webm', contentType: 'audio/webm'});
  assert.equal(r2.status, 429);
});

test('Transcribe: zu große Datei -> 413', async () => {
  const big = Buffer.alloc(13 * 1024 * 1024, 1);
  const res = await request(makeApp())
    .post('/api/transcribe')
    .attach('audio', big, {filename: 'a.wav', contentType: 'audio/wav'});
  assert.equal(res.status, 413);
  assert.equal(res.body.code, 'PAYLOAD_TOO_LARGE');
});

// ---------- Diverses ----------
test('Unbekannte API-Route -> 404 NOT_FOUND JSON', async () => {
  const res = await request(makeApp()).get('/api/gibts-nicht');
  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
});

test('Kein x-powered-by Header', async () => {
  const res = await request(makeApp()).get('/api/version');
  assert.equal(res.headers['x-powered-by'], undefined);
});
