// PWA upgrade flow test: build A → run server → open app + draft → build B (same dist,
// changed __BUILD_VERSION__) → restart ONLY our server PID (port 3107) → trigger SW
// update via visibility + registration.update() → safe-click update prompt →
// verify new client version, draft retained, old cache gone, API never cached.
// Usage: node tests/pwa-upgrade.mjs
// Env: PORT (default 3107), BASE_URL override allowed.
import { chromium } from 'playwright';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EVID = resolve(ROOT, 'evidence');
mkdirSync(EVID, { recursive: true });

const PORT = Number(process.env.PORT || 3107);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const results = [];
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail: String(detail).slice(0, 500) });
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}  -- ${detail}`); }
};

const waitHttp = (url, tries = 60) => new Promise((res, rej) => {
  let n = 0;
  const tick = () => http.get(url, r => { r.resume(); res(); })
    .on('error', () => (++n > tries ? rej(new Error('server did not start')) : setTimeout(tick, 500)));
  tick();
});

const getJson = url => new Promise((res, rej) =>
  http.get(url, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch { res({ raw: b }); } }); }).on('error', rej));

const build = version => {
  console.log(`\n== npm run build (BUILD_VERSION=${version}) ==`);
  execFileSync('npm', ['run', 'build'], {
    cwd: ROOT, stdio: 'inherit',
    env: { ...process.env, BUILD_VERSION: version },
  });
};

const startServer = () => {
  const proc = spawn('node', ['server/index.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
    detached: false,
  });
  proc.stdout.on('data', d => process.stdout.write(`[server] ${d}`));
  proc.stderr.on('data', d => process.stderr.write(`[server:err] ${d}`));
  return proc;
};

const FIRST = async (page, cands, optional) => {
  for (const s of cands) {
    try { const l = page.locator(s).first(); if (await l.count() > 0) return l; } catch {}
  }
  if (optional) return null;
  throw new Error(`no selector: ${cands.join(' | ')}`);
};

const SEL = {
  chatInput: ['[data-testid="chat-input"]', 'textarea', 'input[type="text"]', '[contenteditable="true"]'],
  updatePrompt: [
    '[data-testid="update-available"]', '[data-testid="update-prompt"]',
    'text=/[Aa]ktualisierung verfügbar|[Uu]pdate verfügbar|Neue Version verfügbar|Neu laden/i',
  ],
  updateAccept: [
    '[data-testid="update-accept"]', 'button:has-text("Aktualisieren")',
    'button:has-text("Neu laden")', 'button:has-text("Jetzt laden")', 'button:has-text("Update")',
  ],
  versionBadge: ['[data-testid="app-version"]', '[data-testid="version"]', 'text=/update-test-[AB]/'],
};

async function main() {
  // ---- Build A + server boot
  build('update-test-A');
  let server = startServer();
  await waitHttp(`${BASE_URL}/healthz`);
  const healthA = await getJson(`${BASE_URL}/healthz`);
  check('server A /healthz reports update-test-A', /update-test-A/.test(JSON.stringify(healthA)), JSON.stringify(healthA));

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'de-DE', serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  page.on('pageerror', e => results.push({ name: 'pageerror (informational)', ok: true, detail: String(e).slice(0, 200) }));

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  // Wait for SW active
  const swA = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.ready;
    return { scope: reg.scope, script: reg.active?.scriptURL };
  });
  check('service worker registered & active (A)', !!swA?.script, JSON.stringify(swA));

  const cachesBefore = await page.evaluate(() => caches.keys());
  console.log('  caches before:', cachesBefore.join(', ') || '(none)');

  const verA = await page.evaluate(async () => (await fetch('/api/version', { cache: 'no-store' })).json().catch(() => ({})));
  check('/api/version → update-test-A', /update-test-A/.test(JSON.stringify(verA)), JSON.stringify(verA));

  // ---- Open chat, create a draft (NOT sent)
  for (const name of ['Sokrates', 'sokrates']) {
    try { const c = page.locator(`text=${name}`).first(); if (await c.count()) { await c.click({ timeout: 2500 }); break; } } catch {}
  }
  const inp = await FIRST(page, SEL.chatInput, true);
  check('chat input available (A)', !!inp);
  const draft = `Upgrade-Entwurf-${Date.now()}`;
  if (inp) {
    await inp.fill(draft).catch(async () => inp.type(draft));
    await page.waitForTimeout(500); // debounce persist
  }

  let pendingRoute;
  await page.route('**/api/chat',route=>{pendingRoute=route});
  await page.getByTestId('send-button').click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Antwort abbrechen"]'));

  // ---- Build B while server A still running (same dist dir, new version)
  build('update-test-B');

  // Restart ONLY our server process (scoped PID)
  server.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 800));
  try { server.kill('SIGKILL'); } catch {}
  server = startServer();
  await waitHttp(`${BASE_URL}/healthz`);
  const healthB = await getJson(`${BASE_URL}/healthz`);
  check('server B /healthz reports update-test-B', /update-test-B/.test(JSON.stringify(healthB)), JSON.stringify(healthB));

  // ---- Same browser, same page. Trigger SW update: visibilitychange + registration.update()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))).catch(() => {});
  const upd = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return { ok: false, reason: 'no registration' };
    try { await reg.update(); } catch (e) { return { ok: false, reason: String(e) }; }
    for (let i = 0; i < 60; i++) {
      if (reg.waiting) return { ok: true, state: 'waiting' };
      await new Promise(r => setTimeout(r, 250));
    }
    return { ok: false, state: 'none' };
  });
  check('SW found update and reached waiting state', !!upd.ok, JSON.stringify(upd));

  const prompt = await (async () => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      for (const s of SEL.updatePrompt) {
        try { const l = page.locator(s).first(); if (await l.isVisible({ timeout: 300 }).catch(() => false)) return l; } catch {}
      }
      await page.waitForTimeout(300);
    }
    return null;
  })();
  check('update prompt visible (safe update offered)', !!prompt,
    prompt ? await prompt.innerText().catch(() => '') : 'no prompt surfaced');

  const accept = await (async () => {
    for (const s of SEL.updateAccept) {
      try { const l = page.locator(s).first(); if (await l.isVisible({ timeout: 500 }).catch(() => false)) return l; } catch {}
    }
    return null;
  })();
  check('update accept control present', !!accept);
  if (accept) {
    check('update disabled while conversation is in flight',await accept.isDisabled());
    await page.getByRole('button',{name:'Antwort abbrechen'}).click();
    if(pendingRoute)await pendingRoute.abort().catch(()=>{});
    await page.waitForTimeout(250);
    check('update enabled after explicit cancellation',await accept.isEnabled());
    await accept.click();
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  // ---- Verify new client version
  const verB = await page.evaluate(async () => (await fetch('/api/version', { cache: 'no-store' })).json().catch(() => ({})));
  check('/api/version → update-test-B after update', /update-test-B/.test(JSON.stringify(verB)), JSON.stringify(verB));
  const badge = await FIRST(page, SEL.versionBadge, true);
  const badgeText = badge ? await badge.innerText().catch(() => '') : '';
  results.push({ name: 'client version badge (informational)', ok: true, detail: badgeText || 'no badge element' });
  const clientVer = await page.evaluate(() => window.__APP_VERSION__ || document.querySelector('meta[name="app-version"]')?.content || null).catch(() => null);
  check('actual client runtime upgraded to build B',clientVer==='update-test-B',JSON.stringify(clientVer));

  // ---- Draft retained across update
  const inp2 = await FIRST(page, SEL.chatInput, true);
  const val = inp2 ? await inp2.inputValue().catch(async () => inp2.innerText().catch(() => '')) : '';
  check('draft retained after PWA upgrade', val.includes(draft), `value="${val.slice(0, 80)}"`);

  // ---- Old caches removed, new present
  const cachesAfter = await page.evaluate(() => caches.keys());
  console.log('  caches after:', cachesAfter.join(', ') || '(none)');
  const oldNamed = cachesBefore.filter(c => /A|update-test-A/i.test(c));
  const stale = oldNamed.filter(c => cachesAfter.includes(c));
  check('old version caches removed', stale.length === 0, stale.length ? stale.join(', ') : `before=[${cachesBefore}] after=[${cachesAfter}]`);
  const hasB = cachesAfter.some(c => /B|update-test-B/i.test(c));
  results.push({ name: 'new version cache present (informational)', ok: hasB || cachesAfter.length > 0, detail: cachesAfter.join(', ') });

  // ---- API never cached
  const apiProbe = await page.evaluate(async () => {
    const out = { cacheApiHasApi: false, hits: [] };
    const keys = await caches.keys();
    for (const k of keys) {
      const c = await caches.open(k);
      const reqs = await c.keys();
      for (const r of reqs) if (/\/api\//.test(new URL(r.url).pathname)) { out.cacheApiHasApi = true; out.hits.push(`${k}:${r.url}`); }
    }
    return out;
  });
  check('API responses never stored in Cache API', !apiProbe.cacheApiHasApi, apiProbe.hits.slice(0, 3).join(' | '));

  const apiCacheHdr = await page.evaluate(async () => {
    const r = await fetch('/api/version', { cache: 'no-store' }).catch(() => null);
    return r ? r.headers.get('cache-control') : null;
  });
  check('API served with no-store/no-cache header', /no-store|no-cache/.test(apiCacheHdr || ''), String(apiCacheHdr));

  // ---- Offline shell still works after upgrade (new SW intact)
  await ctx.setOffline(true);
  const offResp = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
  const offOk = !!offResp && offResp.status() < 400;
  results.push({ name: 'offline shell loads from new SW (informational)', ok: offOk, detail: offResp ? `status ${offResp.status()}` : 'navigation failed while offline' });
  await ctx.setOffline(false);

  await ctx.close();
  await browser.close();
  try { server.kill('SIGTERM'); } catch {}

  writeFileSync(resolve(EVID, 'pwa-upgrade-results.json'),
    JSON.stringify({ baseUrl: BASE_URL, at: new Date().toISOString(), passed, failed, results }, null, 2));
  console.log(`\n${passed} passed, ${failed} failed → evidence/pwa-upgrade-results.json`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
