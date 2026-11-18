import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPushEndpoint, publicKeyOf, vapidAuth } from '../src/push.js';
import { Social } from '../src/social.js';
import { fakeCtx } from './helpers/fake-ctx.mjs';

const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
const FCM = 'https://fcm.googleapis.com/fcm/send/abc';
const MOZ = 'https://updates.push.services.mozilla.com/wpush/v2/xyz';
const MON = Date.parse('2026-11-23T00:10:00+01:00'); // Monday 00:10 in Prague
const req = body => new Request('https://social/push', { method: 'POST', body: JSON.stringify(body) });
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

test('only real push services are accepted as endpoints', () => {
  assert.ok(isPushEndpoint(FCM));
  assert.ok(isPushEndpoint(MOZ));
  assert.ok(isPushEndpoint('https://web.push.apple.com/QGf'));
  assert.ok(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=1'));
  for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.example/fcm.googleapis.com', 'https://fcm.googleapis.com.evil.example/x', 'https://127.0.0.1/', 'nope', 42, 'https://fcm.googleapis.com/' + 'a'.repeat(1100)]) {
    assert.ok(!isPushEndpoint(bad), String(bad).slice(0, 60));
  }
});

test('the VAPID header carries a valid ES256 token for the push service', async () => {
  const header = await vapidAuth(FCM, jwk, 'https://numly.jkvapil.cz', 1_000_000_000_000);
  const [, token, key] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(key, publicKeyOf(jwk));
  assert.equal(unb64(key).length, 65);
  const [head, body, sig] = token.split('.');
  const claims = JSON.parse(new TextDecoder().decode(unb64(body)));
  assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: 1_000_000_000 + 12 * 3600, sub: 'https://numly.jkvapil.cz' });
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.publicKey, unb64(sig), new TextEncoder().encode(`${head}.${body}`));
  assert.ok(ok);
});

test('subscriptions: validated, stored once, removable', async () => {
  const s = new Social(fakeCtx(), { VAPID_KEY: JSON.stringify(jwk) });
  assert.equal((await s.pushRequest(req({ action: 'subscribe', endpoint: 'https://evil.example/x' }))).status, 400);
  assert.equal((await s.pushRequest(req({ action: 'nope', endpoint: FCM }))).status, 400);
  assert.equal((await s.pushRequest(req({ action: 'subscribe', endpoint: FCM }))).status, 204);
  assert.equal((await s.pushRequest(req({ action: 'subscribe', endpoint: FCM }))).status, 204);
  assert.deepEqual(s.q(`SELECT endpoint FROM push_subs`), [{ endpoint: FCM }]);
  await s.pushRequest(req({ action: 'unsubscribe', endpoint: FCM }));
  assert.equal(s.q(`SELECT * FROM push_subs`).length, 0);
});

test('the Monday reminder goes out once per week and drops dead subscriptions', async () => {
  const s = new Social(fakeCtx(), { VAPID_KEY: JSON.stringify(jwk) });
  await s.pushRequest(req({ action: 'subscribe', endpoint: FCM }));
  await s.pushRequest(req({ action: 'subscribe', endpoint: MOZ }));
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization });
    return new Response(null, { status: url === MOZ ? 410 : 201 });
  };
  assert.equal(await s.pushWeek(MON - 3600e3, fetchFn), 0, 'still Sunday in Prague');
  assert.equal(calls.length, 0);
  assert.equal(await s.pushWeek(MON, fetchFn), 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.auth.startsWith('vapid t=')));
  assert.deepEqual(s.q(`SELECT endpoint FROM push_subs`), [{ endpoint: FCM }], 'gone subscription removed');
  assert.equal(await s.pushWeek(MON + 3600e3, fetchFn), 0, 'second cron run the same week');
  assert.equal(calls.length, 2);
});
