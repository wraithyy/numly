// Numly API. The daily code is derived from a server-only secret, so it never ships to the browser;
// clients only ever learn how many digits of a guess are in the right place.
import { LEN, scoreOf } from '../public/js/logic.js';

const enc = new TextEncoder();
const DAY_MS = 864e5;

/** Daily code = HMAC-SHA256(secret, date), reduced to LEN digits. Same for everyone, unguessable without the secret. */
export async function codeFor(day, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new DataView(await crypto.subtle.sign('HMAC', key, enc.encode(day)));
  return String(mac.getUint32(0) % 10 ** LEN).padStart(LEN, '0');
}

/** Players send their local date; timezones span roughly UTC-12..UTC+14, so allow one day either side of UTC. */
export function isPlayableDay(day, now = Date.now()) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const todayUtc = Date.parse(new Date(now).toISOString().slice(0, 10));
  return Math.abs(Date.parse(day) - todayUtc) <= DAY_MS;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

async function handleGuess(req, env) {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!env.SECRET) return json({ error: 'server not configured' }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const { day, guess } = body ?? {};
  if (typeof guess !== 'string' || !/^\d{5}$/.test(guess)) return json({ error: 'guess must be 5 digits' }, 400);
  if (!isPlayableDay(day)) return json({ error: 'invalid day' }, 400);

  const code = await codeFor(day, env.SECRET);
  return json({ hits: scoreOf(guess, code) });
}

export default {
  fetch(req, env) {
    const { pathname } = new URL(req.url);
    return pathname === '/api/guess' ? handleGuess(req, env) : env.ASSETS.fetch(req);
  },
};
