// End-to-end helpers: a throwaway Worker per scenario and headless Chrome over the DevTools protocol.
// Each server gets its own secret, forced weekly spec and storage, so runs never touch .dev.vars data.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SECRET = 'e2e-secret';
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const temps = [];
const tempDir = prefix => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
export const cleanup = () => temps.splice(0).forEach(d => rmSync(d, { recursive: true, force: true }));

let failures = 0;
export const failed = () => failures;
export function check(name, ok, extra = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
}

/** `wrangler dev` on the built dist/ with a pinned secret and, optionally, a forced weekly spec. */
export async function startServer(port, weekSpec = null) {
  const vars = ['--var', `SECRET:${SECRET}`, ...(weekSpec ? ['--var', `WEEK_SPEC:${JSON.stringify(weekSpec)}`] : [])];
  const proc = spawn('npx', ['wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', tempDir('numly-e2e-'), ...vars], { stdio: 'ignore', detached: true });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(base + '/')).ok) return { base, env: { SECRET, WEEK_SPEC: weekSpec && JSON.stringify(weekSpec) }, stop: () => process.kill(-proc.pid) };
    } catch {}
    await sleep(250);
  }
  process.kill(-proc.pid);
  throw new Error(`wrangler dev did not start on ${port}`);
}

/** A headless Chrome page. `ev` evaluates in the page; `go` navigates and waits for the app to settle. */
export async function browser(base, port, { width = 500, height = 1000, mobile = false, init = null } = {}) {
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${tempDir('numly-cdp-')}`, 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
    } catch {}
  }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    // Headless Chrome sometimes aborts a cross-document view transition from inside the browser;
    // the page just loads without the slide, and no page code can catch it.
    const d = m.method === 'Runtime.exceptionThrown' && m.params.exceptionDetails;
    if (d && !d.exception?.description?.includes('ViewTransition opt-in disabled')) errors.push(`${d.exception?.description} @ ${d.url ?? ''}:${d.lineNumber}`);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  };
  const send = (method, params = {}) => new Promise(r => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (init) await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const go = async (path, wait = 1800) => {
    await send('Page.navigate', { url: base + path });
    await sleep(wait);
  };
  /** Fresh storage with the first-visit help already seen, Czech UI and an optional nickname. */
  const reset = async (name = null) => {
    await go('/', 800);
    await ev(`localStorage.clear(); localStorage.setItem('numly-seen','true'); localStorage.setItem('numly-week-seen','true'); localStorage.setItem('numly-lang','"cs"');${name ? ` localStorage.setItem('numly-name','"${name}"');` : ''}`);
    await go('/'); // a fresh player id and the nickname take effect on load
  };
  /** Real key presses into the first cell, then Enter. */
  const type = async (code, wait = 2600) => {
    await ev(`document.querySelector('#door input').focus()`);
    for (const c of code) await send('Input.insertText', { text: c });
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await sleep(wait);
  };
  const text = sel => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
  const pubOf = () => ev(`(async () => { const p = JSON.parse(localStorage.getItem('numly-player')); const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('numly:' + p)); return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(''); })()`);
  return { send, ev, go, reset, type, text, pubOf, errors, close: () => { ws.close(); proc.kill(); } };
}

/** Makes `a` and `b` friends through `b` opening `a`'s link. */
export async function befriend(a, b, aName) {
  await b.go(`/?f=${await a.pubOf()}&n=${aName}`, 1500);
  await a.go('/');
  await a.ev(`document.getElementById('friendsBtn').click()`);
  await sleep(300);
  await a.ev(`[...document.querySelectorAll('#incoming .btn')].find(b => b.textContent === 'Přijmout').click()`);
  await sleep(1000);
  await a.ev(`document.getElementById('friends').close()`);
}
