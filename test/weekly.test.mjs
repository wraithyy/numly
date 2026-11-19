import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Social } from '../src/social.js';
import { previousWeek, weekGame } from '../src/weekly.js';
import { gameWeek, weekStartDay } from '../shared/week.js';
import { fakeCtx } from './helpers/fake-ctx.mjs';

const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';
const WEEK = '2026-W47';
const MON = Date.parse('2026-11-16T10:00:00Z');
const TUE = MON + 864e5;

function setup(spec = { type: 'big', mods: [] }) {
  const env = { SECRET: 'test-secret', WEEK_SPEC: JSON.stringify(spec) };
  const s = new Social(fakeCtx(), env);
  s.touch(A, 'Ann');
  s.touch(B, 'Bob');
  s.request(A, B);
  s.accept(B, A);
  return { s, env };
}
const codeOf = async (env, week = WEEK) => (await weekGame(env, week)).secret.code;
const wrongFor = code => [...code].map(c => String((Number(c) + 1) % 10)).join('');

test('the week view never carries the current code, but reveals last week', async () => {
  const { s, env } = setup();
  const view = await s.weekly.view(A, WEEK, '2026-11-16');
  assert.equal(view.week, WEEK);
  assert.ok(!JSON.stringify(view).includes(await codeOf(env)));
  assert.equal(view.last.week, '2026-W46');
  assert.equal(view.last.code, await codeOf(env, '2026-W46'));
  assert.equal(previousWeek('2026-W01'), '2025-W52');
  assert.equal(weekStartDay(gameWeek(MON)), '2026-11-16');
});

test('only the current week accepts guesses, and they must fit the spec', async () => {
  const { s } = setup();
  assert.equal((await s.weekly.guess(A, '2026-W46', '12345678', MON)).status, 409);
  assert.equal((await s.weekly.guess(A, WEEK, '1234', MON)).status, 400);
  assert.equal((await s.weekly.guess(A, WEEK, '1234567A', MON)).status, 400);
});

test('a daily ration, more the next day, none after solving', async () => {
  const { s, env } = setup();
  const code = await codeOf(env);
  const { perDay } = (await s.weekly.game(WEEK)).spec;
  for (let i = 0; i < perDay; i++) assert.equal((await s.weekly.guess(A, WEEK, wrongFor(code), MON + i)).status, 200);
  const blocked = await s.weekly.guess(A, WEEK, code, MON + 9);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.todayLeft, 0);

  const solved = await s.weekly.guess(A, WEEK, code, TUE);
  assert.equal(solved.status, 200);
  assert.deepEqual(solved.body.result, { hits: 6, solved: true });
  assert.equal(solved.body.tries.length, perDay + 1);
  assert.equal(solved.body.solved, true);
  assert.equal((await s.weekly.guess(A, WEEK, code, TUE + 1)).status, 409);
});

test('alarm rations each day but never locks the week', async () => {
  const { s, env } = setup({ type: 'big', mods: ['alarm'] });
  const wrong = wrongFor(await codeOf(env));
  const { perDay } = (await s.weekly.game(WEEK)).spec;
  for (let day = 0; day < 7; day++) {
    const at = MON + day * 864e5;
    for (let i = 0; i < perDay; i++) assert.equal((await s.weekly.guess(A, WEEK, wrong, at + i)).status, 200, `day ${day} try ${i + 1}`);
    const blocked = await s.weekly.guess(A, WEEK, wrong, at + 9);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.todayLeft, 0);
  }
});

test('mastermind and hex flow through to the player', async () => {
  const { s, env } = setup({ type: 'big', mods: ['hex', 'mastermind'] });
  const code = await codeOf(env);
  assert.match(code, /^[0-9A-F]{5}$/);
  const reversed = [...code].reverse().join('');
  const res = await s.weekly.guess(A, WEEK, reversed, MON);
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.result.near, 'number');
  assert.equal(res.body.tries[0].near, res.body.result.near);
});

test('the friends board ranks the week and rides along with the live state', async () => {
  const { s, env } = setup();
  const code = await codeOf(env);
  await s.weekly.guess(B, WEEK, wrongFor(code), MON);
  await s.weekly.guess(B, WEEK, code, MON + 1);
  await s.weekly.guess(A, WEEK, wrongFor(code), MON + 2, true); // with the automatic notepad
  const board = s.weekly.board(A, WEEK);
  assert.deepEqual(board.rows.map(r => [r.name, r.tries, r.solved, r.pad]), [['Bob', 2, true, false], ['Ann', 1, false, true]]);
  assert.equal(s.state(A).week === null || Array.isArray(s.state(A).week.rows), true);
});

test('this week keeps its draw when new types ship', async () => {
  const env = { SECRET: 'test-secret' };
  const now = await weekGame(env, WEEK);
  assert.equal(now.spec.type, 'big');
  assert.deepEqual(await weekGame(env, WEEK), now);
});

test('a grid try stores and returns row and column hits', async () => {
  const { s, env } = setup({ type: 'grid', mods: [] });
  const code = await codeOf(env);
  const guess = code.slice(0, 5) + wrongFor(code.slice(5));
  const res = await s.weekly.guess(A, WEEK, guess, MON);
  assert.deepEqual(res.body.result.rows, [5, 0, 0, 0, 0]);
  assert.deepEqual(res.body.tries[0].cols, [1, 1, 1, 1, 1]);
  assert.equal(s.weekly.board(A, WEEK).rows.find(r => r.name === 'Ann').progress, 5);
});

test('a heist opens safe by safe and reveals each link only after its safe', async () => {
  const { s, env } = setup({ type: 'heist', mods: [] });
  const { secret } = await weekGame(env, WEEK);
  let view = await s.weekly.view(A, WEEK, '2026-11-16');
  assert.deepEqual(view.heist, { current: 0, links: [] });

  const miss = await s.weekly.guess(A, WEEK, wrongFor(secret.codes[0]), MON);
  assert.deepEqual({ ...miss.body.result }, { hits: 0, safe: 0, opened: false, solved: false });

  const first = await s.weekly.guess(A, WEEK, secret.codes[0], MON + 1);
  assert.equal(first.body.result.opened, true);
  assert.equal(first.body.solved, false);
  assert.deepEqual(first.body.heist, { current: 1, links: [secret.links[0]] });
  assert.equal(s.weekly.board(A, WEEK).rows.find(r => r.name === 'Ann').progress, 1);

  // The next guess is judged against safe two; guessing safe one again just misses.
  const again = await s.weekly.guess(A, WEEK, secret.codes[0], MON + 2);
  assert.equal(again.body.result.safe, 1);

  let at = MON + 3;
  for (const code of secret.codes.slice(1)) {
    if (s.weekly.limits(view.spec, WEEK, A, '2026-11-16').todayLeft === 0) at = TUE;
    view = (await s.weekly.guess(A, WEEK, code, at++)).body;
  }
  assert.equal(view.solved, true);
  assert.equal(view.heist.current, 5);
  assert.equal(view.result.solved, true);
});

test('migrations are safe to run twice', () => {
  const ctx = fakeCtx();
  new Social(ctx, {});
  assert.doesNotThrow(() => new Social(ctx, {}));
});

test('golden draws: shipped weeks never change (update only for weeks that have not started)', async () => {
  const { createHash } = await import('node:crypto');
  const golden = {
    '2026-W47': ['big', ['hex', 'sum'], 'a792305f66da8020'], // re-pinned: the big safe went from 8 to 6 digits mid-week, tries reset
    '2026-W48': ['grid', ['alarm', 'timer'], 'c73cfcc2e9181d06'],
    '2026-W49': ['heist', ['sum', 'timer'], '8b935fb410e4d2e4'],
    '2026-W50': ['grid', ['timer'], 'cab40bdc69b83afc'],
    '2026-W51': ['cipher', [], '60f522f57fd1ca73'], // timer retired from ciphers before the week began
    '2026-W52': ['grid', [], '61b320bd112d8384'],
  };
  for (const [week, [type, mods, hash]] of Object.entries(golden)) {
    const { spec, secret } = await weekGame({ SECRET: 'golden-secret' }, week);
    assert.deepEqual([spec.type, spec.mods], [type, mods], week);
    assert.equal(createHash('sha256').update(JSON.stringify(secret)).digest('hex').slice(0, 16), hash, `${week} secret`);
  }
});

test('the first-release week_tries table is migrated and keeps working', async () => {
  const ctx = fakeCtx();
  ctx.storage.sql.exec(`CREATE TABLE week_tries (
     week TEXT NOT NULL, pub TEXT NOT NULL, n INTEGER NOT NULL,
     guess TEXT NOT NULL, hits INTEGER NOT NULL, near INTEGER, solved INTEGER NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL,
     PRIMARY KEY (week, pub, n))`);
  ctx.storage.sql.exec(`INSERT INTO week_tries VALUES ('${WEEK}', '${A}', 1, '000000', 3, NULL, 0, '2026-11-16', ${MON})`);
  const env = { SECRET: 'test-secret', WEEK_SPEC: JSON.stringify({ type: 'big', mods: [] }) };
  const s = new Social(ctx, env);
  s.touch(A, 'Ann');
  const res = await s.weekly.guess(A, WEEK, '111111', MON + 1);
  assert.equal(res.status, 200);
  assert.equal(res.body.tries.length, 2);
  assert.equal(s.weekly.board(A, WEEK).rows[0].progress >= 3, true); // old rows fall back to hits
});

test('a malformed WEEK_SPEC is ignored', async () => {
  const { spec } = await weekGame({ SECRET: 'x', WEEK_SPEC: '{oops' }, WEEK);
  assert.equal(spec.type, 'big');
});

test('viewing the week creates no player row; a try does', async () => {
  const s = new Social(fakeCtx(), { SECRET: 'test-secret' });
  const C = 'cccccccccccccccc';
  const view = await s.weekRequest(new Request('https://social/week', { method: 'POST', body: JSON.stringify({ action: 'view', pub: C }) }));
  assert.equal(view.status, 200);
  assert.equal(s.q(`SELECT COUNT(*) AS n FROM players WHERE pub = ?`, C)[0].n, 0);
});
