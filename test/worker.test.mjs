import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { codeFor } from '../src/worker.js';
import { gameDay, shiftDay, msUntilNextDay } from '../public/js/logic.js';
import { publicId } from '../public/js/friends.js';

const events = [];
const SOCIAL = {
  idFromName: name => name,
  get: id => ({ fetch: async (url, init) => { events.push({ id, url: String(url), body: JSON.parse(init.body) }); return new Response(null, { status: 204 }); } }),
};
const env = { SECRET: 'test-secret', ASSETS: { fetch: () => new Response('asset') }, SOCIAL };
const today = gameDay();
const guess = (body, method = 'POST') =>
  worker.fetch(new Request('http://x/api/guess', { method, body: method === 'POST' ? JSON.stringify(body) : undefined }), env);

test('code is stable per day and differs across days and secrets', async () => {
  const a = await codeFor('2026-11-18', 's1');
  assert.match(a, /^\d{5}$/);
  assert.equal(a, await codeFor('2026-11-18', 's1'));
  assert.notEqual(a, await codeFor('2026-11-18', 's2'));
});

test('scores hits by position and never returns the code', async () => {
  const code = await codeFor(today, env.SECRET);
  const res = await guess({ day: today, guess: code });
  assert.deepEqual(await res.json(), { hits: 5 });
  const wrong = [...code].map((d, i) => (i === 0 ? d : String((+d + 1) % 10))).join('');
  assert.deepEqual(await (await guess({ day: today, guess: wrong })).json(), { hits: 1 });
});

test('rejects bad input', async () => {
  assert.equal((await guess({ day: today, guess: '1234' })).status, 400);
  assert.equal((await guess({ day: today, guess: 12345 })).status, 400);
  assert.equal((await guess({ day: '2020-01-01', guess: '12345' })).status, 409);
  assert.equal((await guess(null, 'GET')).status, 405);
});

test('non-API paths go to static assets', async () => {
  const res = await worker.fetch(new Request('http://x/'), env);
  assert.equal(await res.text(), 'asset');
});

test('only today in the game timezone is playable, so a shifted device clock cannot unlock tomorrow', async () => {
  for (const day of [shiftDay(today, 1), shiftDay(today, -1)]) {
    const res = await guess({ day, guess: '12345' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).day, today);
  }
});

test('gameDay follows Europe/Prague and the countdown stays within a day', () => {
  assert.equal(gameDay(Date.parse('2026-11-18T23:30:00Z')), '2026-11-19'); // 00:30 in Prague
  assert.equal(gameDay(Date.parse('2026-11-18T22:30:00Z')), '2026-11-18'); // 23:30 in Prague
  const ms = msUntilNextDay(Date.parse('2026-11-18T22:30:00Z'));
  assert.ok(Math.abs(ms - 30 * 60e3) < 1000, `expected ~30 min, got ${ms}`);
});

test('a scored guess is recorded under the hashed player id', async () => {
  events.length = 0;
  const res = await guess({ day: today, guess: '12345', player: 'player-abcdef12', name: '  Ann ', pad: true });
  assert.equal(res.status, 200);
  assert.equal(events.length, 1);
  const { url, body } = events[0];
  assert.equal(url, 'https://social/guess');
  assert.equal(body.pub, await publicId('player-abcdef12'));
  assert.deepEqual([body.name, body.pad, body.hits], ['Ann', true, (await res.json()).hits]);
  assert.ok(!JSON.stringify(body).includes('player-abcdef12'), 'raw player id must not leave the Worker');
});

test('guesses without a valid player id are scored but not recorded', async () => {
  events.length = 0;
  assert.equal((await guess({ day: today, guess: '12345', player: 'x' })).status, 200);
  assert.equal(events.length, 0);
});

test('friends endpoint only accepts WebSocket upgrades', async () => {
  const res = await worker.fetch(new Request('http://x/api/friends'), env);
  assert.equal(res.status, 426);
});
