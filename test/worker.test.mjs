import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { codeFor } from '../src/worker.js';

const env = { SECRET: 'test-secret', ASSETS: { fetch: () => new Response('asset') } };
const today = new Date().toISOString().slice(0, 10);
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
  assert.equal((await guess({ day: '2020-01-01', guess: '12345' })).status, 400);
  assert.equal((await guess(null, 'GET')).status, 405);
});

test('non-API paths go to static assets', async () => {
  const res = await worker.fetch(new Request('http://x/'), env);
  assert.equal(await res.text(), 'asset');
});
