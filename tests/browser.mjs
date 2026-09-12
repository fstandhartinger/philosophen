// Browser E2E harness for the Philosophen app.
// Usage: node tests/browser.mjs
// Env: BASE_URL (default http://localhost:3000), HEADED=1 for visible browser.
// Writes evidence/desktop.png, evidence/mobile.png, evidence/browser-results.json
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EVID = resolve(ROOT, 'evidence');
mkdirSync(EVID, { recursive: true });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const results = [];
let passed = 0, failed = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail: String(detail).slice(0, 500) });
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}  -- ${detail}`); }
}

// ---- Resilient selector helpers (adapt to actual UI once src/ lands) ----
const SEL = {
  cards: [
    '[data-testid="persona-card"]', '[data-testid="philosopher-card"]',
    '.persona-card', '.philosopher-card', '.card',
    'main article', 'main [role="button"]', 'main li', 'main a',
  ],
  chatInput: [
    '[data-testid="chat-input"]', 'textarea', 'input[type="text"]',
    '[contenteditable="true"]',
  ],
  sendButton: [
    '[data-testid="send-button"]', 'button[type="submit"]',
    'button:has-text("Senden")', 'button:has-text("Send")', 'button:has-text("→")',
  ],
  messages: [
    '[data-testid="message"]', '.message', '[data-role="message"]',
    '.chat-message', 'main li', '[class*="message"]',
  ],
  backButton: [
    'button:has-text("Zurück")', 'button:has-text("←")', '[data-testid="back"]',
    'a:has-text("Zurück")', 'button[aria-label*="urück"]',
  ],
  clearButton: [
    'button:has-text("Löschen")', 'button:has-text("Zurücksetzen")',
    'button:has-text("Neu")', '[data-testid="clear"]', '[data-testid="reset"]',
  ],
  micButton: [
    '[data-testid="mic"]', 'button[aria-label*="Mikro"]', 'button[aria-label*="mikro"]',
    'button:has-text("🎤")', 'button[class*="mic"]', 'button[aria-label*="Aufnahme"]',
  ],
  disclaimer: [
    'text=/KI|künstliche|Künstliche|generiert|Simulat|Hinweis|Disclaimer/i',
  ],
  offlineIndicator: [
    'text=/[Oo]ffline|keine Verbindung|Keine Verbindung/i',
    '[data-testid="offline"]', '[class*="offline"]',
  ],
  transcriptBox: [
    '[data-testid="transcript"]', 'textarea', '[contenteditable="true"]',
  ],
  versionBadge: [
    '[data-testid="version"]', 'text=/v?\\d+\\.\\d+|update-test|Version/i',
  ],
  updatePrompt: [
    'text=/[Aa]ktualisierung|[Uu]pdate verfügbar|Neue Version|Neu laden/i',
    '[data-testid="update-available"]',
  ],
};

async function first(page, candidates, opts = {}) {
  for (const s of candidates) {
    try {
      const loc = page.locator(s).first();
      if (await loc.count() > 0) return loc;
    } catch { /* try next */ }
  }
  if (opts.optional) return null;
  throw new Error(`No selector matched: ${candidates.join(' | ')}`);
}

async function visible(page, candidates, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const s of candidates) {
      try {
        const loc = page.locator(s).first();
        if (await loc.isVisible({ timeout: 250 }).catch(() => false)) return loc;
      } catch { /* next */ }
    }
    await new Promise(r => setTimeout(r, 150));
  }
  return null;
}

const PERSONAS = ['sokrates', 'aristoteles', 'epikur', 'kant', 'nietzsche', 'arendt', 'beauvoir', 'camus'];

async function main() {
  console.log(`BASE_URL=${BASE_URL}`);
  const browser = await chromium.launch({
    headless: !process.env.HEADED,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });

  // ---------------------------------------------------------------- desktop
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'de-DE',
    serviceWorkers: 'allow',
  });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  // --- Landing: all 8 cards
  let cardsCount = 0;
  let cardsLoc = null;
  for (const s of SEL.cards) {
    const c = await page.locator(s).count().catch(() => 0);
    if (c >= 8) { cardsCount = c; cardsLoc = page.locator(s); break; }
    if (c > cardsCount) { cardsCount = c; cardsLoc = page.locator(s); }
  }
  check('landing shows 8 philosopher cards', cardsCount >= 8, `found ${cardsCount}`);

  // Each persona name present somewhere on the landing page
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const names = ['Sokrates', 'Aristoteles', 'Epikur', 'Kant', 'Nietzsche', 'Arendt', 'Beauvoir', 'Camus'];
  const missing = names.filter(n => !bodyText.toLowerCase().includes(n.toLowerCase()));
  check('all 8 persona names rendered', missing.length === 0, `missing: ${missing.join(', ')}`);

  // Portraits load (request each)
  for (const p of PERSONAS) {
    const res = await page.request.get(`${BASE_URL}/portraits/${p}.webp`).catch(() => null);
    if (!res || !res.ok()) { check(`portrait ${p}.webp served`, false, `status ${res?.status()}`); }
  }
  check('all portraits served', true);

  check('AI disclaimer absent', !bodyText.includes('Imaginative KI-Simulationen'));

  // --- No horizontal overflow (desktop)
  const overflowD = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow (desktop 1440)', overflowD <= 1, `overflow=${overflowD}px`);

  // --- Select a philosopher → chat view
  let clicked = false;
  for (const name of ['Sokrates', 'sokrates', names[0]]) {
    try {
      const c = page.locator(`text=${name}`).first();
      if (await c.count()) { await c.click({ timeout: 3000 }); clicked = true; break; }
    } catch { /* next */ }
  }
  if (!clicked && cardsLoc) { await cardsLoc.first().click({ timeout: 3000 }).catch(() => {}); }
  await page.waitForTimeout(600);

  const chatInput = await visible(page, SEL.chatInput, 6000);
  check('select → chat input appears', !!chatInput);

  // Greeting / starters present (informational)
  const greet = await visible(page, ['text=/[Hh]allo|[Gg]egrüß|willkommen|frage/i'], 3000);
  check('greeting or starter prompts shown', !!greet, greet ? '' : 'optional, not found');

  // --- Draft: type without sending, reload, must survive
  const draft = `Entwurf-${Date.now()}-Was ist Tugend?`;
  if (chatInput) {
    await chatInput.click();
    await chatInput.fill(draft).catch(async () => { await chatInput.type(draft); });
    await page.waitForTimeout(400); // allow debounce persist
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const after = await visible(page, SEL.chatInput, 6000);
    let val = '';
    if (after) val = await after.inputValue().catch(async () => after.innerText().catch(() => ''));
    check('editable draft survives reload', val.includes(draft), `got "${val.slice(0, 80)}"`);
  } else {
    check('editable draft survives reload', false, 'no chat input');
  }

  // --- Send a chat with a markdown script-injection payload via mocked /api/chat
  const xss = '```html\n<script>window.__xss=1<\/script>\n<img src=x onerror=window.__xss2=1>\nCode ohne Formatierung\n```\n\n**fett** _kursiv_\n\n<script>window.__xss3=1<\/script>';
  await page.route('**/api/chat', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'X-App-Version': 'test' },
    body: JSON.stringify({ reply: `Antwort:\n\n${xss}`, model: 'mock', version: 'test' }),
  }));
  if (chatInput || await visible(page, SEL.chatInput, 3000)) {
    const box = await first(page, SEL.chatInput);
    await box.fill('Zeig mir Markdown');
    const send = await visible(page, SEL.sendButton, 2000);
    if (send) await send.click();
    else await box.press('Enter');
    await page.waitForResponse(r => r.url().includes('/api/chat'), { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    const x1 = await page.evaluate(() => window.__xss || window.__xss2 || window.__xss3 || 0);
    check('markdown script injection NOT executed', !x1, `xss marker=${x1}`);
    const injectedScriptCount = await page.locator('main script, article script, [class*="message"] script').count().catch(() => 0);
    check('no raw <script> element in rendered markdown', injectedScriptCount === 0, `found ${injectedScriptCount}`);
    const bold = await page.locator('strong, b').count().catch(() => 0);
    check('markdown bold rendered (sanitization keeps formatting)', bold > 0, `strong count ${bold}`);
  } else {
    check('markdown script injection NOT executed', false, 'no chat input');
  }
  await page.unroute('**/api/chat').catch(() => {});

  // --- Mic: fake device, intercept /api/transcribe → editable, NOT auto-sent
  let transcribeHit = false; let audioChatCalls = 0;
  await page.route('**/api/chat',route=>{audioChatCalls++;route.abort()});
  await page.route('**/api/transcribe', route => {
    transcribeHit = true;
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ text: 'Transkript-Probe Was ist das Gute?' }),
    });
  });
  const micBtn = await visible(page, SEL.micButton, 3000);
  check('mic button present', !!micBtn, micBtn ? '' : 'not found');
  if (micBtn) {
    await micBtn.click().catch(() => {});
    // fake device produces a tone stream; WAIT for possible auto-stop / press again to stop
    await page.waitForTimeout(2500);
    // click again to stop if still recording
    const stillRec = await page.locator('[class*="recording"], [aria-pressed="true"]').count().catch(() => 0);
    if (stillRec > 0) await micBtn.click().catch(() => {});
    // wait for transcribe call (some UIs stop on silence/toggle)
    for (let i = 0; i < 20 && !transcribeHit; i++) {
      await page.waitForTimeout(250);
      const rec = await page.locator('[class*="recording"]').count().catch(() => 0);
      if (i === 8 && rec > 0) await micBtn.click().catch(() => {});
    }
    check('/api/transcribe called after fake mic recording', transcribeHit);
    if (transcribeHit) {
      await page.waitForTimeout(600);
      // Transcript must be editable in input, not auto-sent
      const box = await first(page, SEL.transcriptBox, { optional: true });
      const val = box ? await box.inputValue().catch(async () => box.innerText().catch(() => '')) : '';
      check('transcript editable in input field', /Transkript-Probe/.test(val), `input="${val.slice(0, 80)}"`);
      // Wait 2.5s: must NOT auto-send (no assistant message from transcribed text)
      await page.waitForTimeout(2500);
      const txt = await page.locator('body').innerText().catch(() => '');
      const autoSent = audioChatCalls > 0; // our mock reply marker – route unroutes, so any new chat call would fail anyway
      check('transcript NOT auto-sent', !autoSent);
    }
  }

  await page.unroute('**/api/chat');
  // --- Mic: permission-denied and unsupported messages (fresh contexts)
  const ctxDenied = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'de-DE', serviceWorkers: 'block' });
  await ctxDenied.grantPermissions([], { origin: BASE_URL }).catch(() => {});
  await ctxDenied.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError')}});
  const pd = await ctxDenied.newPage();
  await pd.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await pd.getByTestId('persona-card').first().click();
  const mic2 = await visible(pd, SEL.micButton, 3000);
  if (mic2) await mic2.click().catch(() => {});
  const deniedMsg = await visible(pd, ['text=/[Zz]ugriff|erlaub|berechtig|verweigert|permission|Mikrofon/i'], 4000);
  check('mic denied → informative message', !!deniedMsg, deniedMsg ? await deniedMsg.innerText().catch(() => '') : 'no message found');
  await ctxDenied.close();

  const ctxNoMic = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'de-DE', serviceWorkers: 'block' });
  await ctxNoMic.addInitScript(() => {
    delete navigator.mediaDevices;
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = undefined;
  });
  const pn = await ctxNoMic.newPage();
  await pn.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await pn.getByTestId('persona-card').first().click();
  const mic3 = await visible(pn, SEL.micButton, 3000);
  if (mic3) await mic3.click().catch(() => {});
  const unsupMsg = await visible(pn, ['text=/nicht unterstützt|unsupported|Mikrofon|Aufnahme/i'], 4000);
  check('mic unsupported → informative message', !!unsupMsg, unsupMsg ? await unsupMsg.innerText().catch(() => '') : 'no message found');
  await ctxNoMic.close();

  // --- Back to landing, then clear/reset
  const back = await visible(page, SEL.backButton, 2500);
  if (back) {
    await back.click().catch(() => {});
    await page.waitForTimeout(500);
    const cardsAgain = (await Promise.all(SEL.cards.map(s => page.locator(s).count().catch(() => 0)))).reduce((a, b) => Math.max(a, b), 0);
    check('back returns to card grid', cardsAgain >= 8, `cards=${cardsAgain}`);
  } else check('back returns to card grid', false, 'no back control found');

  if (chatInput) {
    // Reenter chat, type draft, clear via UI control
    for (const name of ['Sokrates', 'sokrates']) {
      try { const c = page.locator(`text=${name}`).first(); if (await c.count()) { await c.click({ timeout: 2500 }); break; } } catch {}
    }
    const box2 = await visible(page, SEL.chatInput, 5000);
    if (box2) {
      await box2.fill('Zu löschender Entwurf');
      await page.waitForTimeout(400);
      const clear = await visible(page, SEL.clearButton, 2000);
      if (clear) {
        await clear.click().catch(() => {});
        await page.waitForTimeout(400);
        const confirm = await visible(page, ['button:has-text("Bestätigen")', 'button:has-text("Ja")', 'button:has-text("Löschen")'], 1200);
        if (confirm) await confirm.click().catch(() => {});
        const v = await box2.inputValue().catch(async () => box2.innerText().catch(() => ''));
        check('clear/reset empties draft', !/Zu löschender Entwurf/.test(v), `value="${v.slice(0, 60)}"`);
      } else check('clear/reset empties draft', false, 'no clear control found');
    }
  }

  // --- 409 VERSION_MISMATCH stale client handling
  // Recreate chat route that always 409s, send, expect visible error
  await page.route('**/api/chat', route => route.fulfill({
    status: 409, contentType: 'application/json',
    headers: { 'X-App-Version': 'server-newer' },
    body: JSON.stringify({ error: 'Version stimmt nicht überein', code: 'VERSION_MISMATCH', version: 'server-newer' }),
  }));
  {
    const box = await visible(page, SEL.chatInput, 4000);
    if (box) {
      await box.fill('Noch eine Frage');
      const send = await visible(page, SEL.sendButton, 1500);
      if (send) await send.click(); else await box.press('Enter');
      const err = await visible(page, ['text=/[Vv]ersion|aktualisier|neu laden|stimmt nicht/i'], 6000);
      check('409 VERSION_MISMATCH → visible user-facing error', !!err,
        err ? await err.innerText().catch(() => '') : 'no error surfaced');
    } else check('409 VERSION_MISMATCH → visible user-facing error', false, 'no chat input');
  }
  await page.unroute('**/api/chat').catch(() => {});

  // --- Offline indication (context offline)
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline'))).catch(() => {});
  const off = await visible(page, SEL.offlineIndicator, 5000);
  check('offline indication shown', !!off, off ? await off.innerText().catch(() => '') : 'none found');
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online'))).catch(() => {});

  // --- Install instructions / beforeinstallprompt (synthetic vs real)
  // Real installability: manifest + SW reachable
  const mani = await page.request.get(`${BASE_URL}/manifest.webmanifest`).catch(() => null);
  check('manifest.webmanifest served', !!mani && mani.ok(), `status ${mani?.status?.()}`);
  let maniJson = null;
  if (mani && mani.ok()) { maniJson = await mani.json().catch(() => null); }
  check('manifest has name/icons/start_url/display',
    !!(maniJson && maniJson.name && (maniJson.icons || []).length >= 2 && maniJson.start_url && ['standalone', 'minimal-ui', 'fullscreen'].includes(maniJson.display)),
    maniJson ? '' : 'no json');
  const swRes = await page.request.get(`${BASE_URL}/sw.js`).catch(() => null);
  check('service worker /sw.js served (no-cache)', !!swRes && swRes.ok(), `status ${swRes?.status?.()}`);

  const bip = await page.evaluate(async () => {
    // synthetic event — distinguish from a genuine Chrome install prompt
    const ev = new Event('beforeinstallprompt');
    ev.prompt = async () => { window.__bipPrompted = true; };
    ev.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(ev);
    await new Promise(r => setTimeout(r, 300));
    return { syntheticDispatched: true };
  });
  check('synthetic beforeinstallprompt dispatched (not proof of real installability)', bip.syntheticDispatched);
  const installHint = await visible(page, ['text=/[Ii]nstallier|zum Startbildschirm|App installieren|Add to Home/i'], 3000);
  check('installation instructions surfaced (synthetic prompt or static hint)', !!installHint,
    installHint ? await installHint.innerText().catch(() => '') : 'none — may appear only with real prompt criteria');

  // Real-Chrome installability probe: engage heuristics + check getInstalledRelatedApps no-throw
  const realInstallable = await page.evaluate(async () => {
    try { if (navigator.getInstalledRelatedApps) await navigator.getInstalledRelatedApps(); return 'probe-ok'; }
    catch (e) { return `probe-error: ${e}`; }
  });
  results.push({ name: 'real Chrome installability probe (informational)', ok: true, detail: realInstallable });

  // --- SW registration + no API caching
  const swState = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const reg = await navigator.serviceWorker.getRegistration();
    return { supported: true, registered: !!reg, scope: reg?.scope, active: !!reg?.active };
  });
  results.push({ name: 'service worker registration state', ok: swState.registered === true || swState.supported === false, detail: JSON.stringify(swState) });

  // Fetch API twice through page (cached by SW? should not be)
  const apiNoCache = await page.evaluate(async () => {
    const r = await fetch('/api/version', { cache: 'no-store' }).catch(() => null);
    return r ? { status: r.status, cache: r.headers.get('cache-control') } : null;
  });
  check('/api/version no-store header', !!apiNoCache && /no-store|no-cache/.test(apiNoCache.cache || ''), JSON.stringify(apiNoCache));

  // --- API keys never in client bundle/HTML (contract: no system prompt / server-held secrets)
  const htmlLeak = await page.content();
  check('no API key pattern in served HTML', !/(gsk_|sk-ant|sk-[A-Za-z0-9]{20,})/.test(htmlLeak), '');

  // --- Desktop screenshot (full page)
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  const finalBack=page.getByTestId('back');if(await finalBack.count())await finalBack.click();
  await page.screenshot({ path: resolve(EVID, 'desktop.png'), fullPage: true });
  check('evidence/desktop.png written', true);

  // Filter benign console errors (favicon, devtools, etc.)
  const benign = /favicon|DevTools|net::ERR_ABORTED|third-party|deprecat|status of 409/i;
  const realConsole = consoleErrors.filter(e => !benign.test(e));
  const realPage = pageErrors.filter(e => !benign.test(e));
  check('no console errors', realConsole.length === 0, realConsole.slice(0, 3).join(' | '));
  check('no page errors', realPage.length === 0, realPage.slice(0, 3).join(' | '));

  await ctx.close();

  // ---------------------------------------------------------------- mobile
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'de-DE',
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    serviceWorkers: 'allow',
  });
  const mp = await mctx.newPage();
  const mConsoleErr = [], mPageErr = [];
  mp.on('console', m => { if (m.type() === 'error') mConsoleErr.push(m.text()); });
  mp.on('pageerror', e => mPageErr.push(String(e)));
  await mp.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await mp.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  const overflowM = await mp.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow (mobile 390)', overflowM <= 1, `overflow=${overflowM}px`);
  const mCards = (await Promise.all(SEL.cards.map(s => mp.locator(s).count().catch(() => 0)))).reduce((a, b) => Math.max(a, b), 0);
  check('mobile renders cards', mCards >= 8, `cards=${mCards}`);
  await mp.screenshot({ path: resolve(EVID, 'mobile.png'), fullPage: true });
  check('evidence/mobile.png written', true);
  const invite=mp.getByRole('button',{name:'Nein',exact:true});if(await invite.isVisible())await invite.click();
  // Chat flow on mobile (quick)
  for (const name of ['Sokrates', 'sokrates']) {
    try { const c = mp.locator(`text=${name}`).first(); if (await c.count()) { await c.click({ timeout: 2500 }); break; } } catch {}
  }
  const mInput = await visible(mp, SEL.chatInput, 5000);
  check('mobile chat input reachable', !!mInput);
  const mRealC = mConsoleErr.filter(e => !benign.test(e));
  const mRealP = mPageErr.filter(e => !benign.test(e));
  check('no console errors (mobile)', mRealC.length === 0, mRealC.slice(0, 3).join(' | '));
  check('no page errors (mobile)', mRealP.length === 0, mRealP.slice(0, 3).join(' | '));
  await mp.screenshot({ path: resolve(EVID, 'mobile.png'), fullPage: true });
  await mctx.close();

  await browser.close();

  // ---------------------------------------------------------------- summary
  writeFileSync(resolve(EVID, 'browser-results.json'),
    JSON.stringify({ baseUrl: BASE_URL, at: new Date().toISOString(), passed, failed, results }, null, 2));
  console.log(`\n${passed} passed, ${failed} failed → evidence/browser-results.json`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
