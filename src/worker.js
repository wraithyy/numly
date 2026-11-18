// Numly API. The daily code is derived from a server-only secret, so it never ships to the browser;
// clients only ever learn how many digits of a guess are in the right place.
import { LEN, archiveDays, scoreOf, gameDay } from '../shared/logic.js';
import { cleanName, isPlayer, publicId } from '../shared/friends.js';

export { Social } from './social.js';

const enc = new TextEncoder();

/** Daily code = HMAC-SHA256(secret, date), reduced to LEN digits. Same for everyone, unguessable without the secret. */
export async function codeFor(day, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new DataView(await crypto.subtle.sign('HMAC', key, enc.encode(day)));
  return String(mac.getUint32(0) % 10 ** LEN).padStart(LEN, '0');
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

// The whole social graph is small enough for a single Durable Object instance.
const social = env => env.SOCIAL.get(env.SOCIAL.idFromName('global'));

async function handleGuess(req, env) {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!env.SECRET) return json({ error: 'server not configured' }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const { day, guess, player, name, pad } = body ?? {};
  if (typeof guess !== 'string' || !/^\d{5}$/.test(guess)) return json({ error: 'guess must be 5 digits' }, 400);

  // The server's clock decides the day, so moving the phone's date forward cannot unlock tomorrow's safe.
  // Past days come from the archive: playable, but friends only ever see today.
  const today = gameDay();
  const archived = day !== today && archiveDays(today).includes(day);
  if (day !== today && !archived) return json({ error: 'wrong day', day: today }, 409);

  const hits = scoreOf(guess, await codeFor(day, env.SECRET));

  // Count the try for friends' views. A board hiccup must never cost the player their answer.
  if (!archived && env.SOCIAL && isPlayer(player)) {
    const event = {
      pub: await publicId(player),
      name: cleanName(name) || undefined,
      pad: pad === true,
      hits,
      at: Date.now(),
    };
    try {
      await social(env).fetch('https://social/guess', { method: 'POST', body: JSON.stringify(event) });
    } catch (err) {
      console.error('Friends update failed:', err);
    }
  }
  return json({ hits });
}

// Weekly game: the Durable Object draws the week, enforces try limits and judges guesses.
async function handleWeek(req, env) {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!env.SECRET) return json({ error: 'server not configured' }, 500);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const { action, player, name, week, guess } = body ?? {};
  if (!isPlayer(player)) return json({ error: 'invalid player' }, 400);
  if (action !== 'view' && action !== 'guess') return json({ error: 'invalid action' }, 400);
  if (action === 'guess' && (typeof guess !== 'string' || typeof week !== 'string')) return json({ error: 'invalid guess' }, 400);

  const forward = { action, pub: await publicId(player), name: cleanName(name) || undefined, week, guess };
  const res = await social(env).fetch('https://social/week', { method: 'POST', body: JSON.stringify(forward) });
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

// Live friends feed and friend requests over one WebSocket.
function handleFriends(req, env) {
  if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426);
  return social(env).fetch(new Request('https://social/ws', req));
}

export default {
  fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname === '/api/guess') return handleGuess(req, env);
    if (pathname === '/api/friends') return handleFriends(req, env);
    if (pathname === '/api/week') return handleWeek(req, env);
    return env.ASSETS.fetch(req);
  },
};
