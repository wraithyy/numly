import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextWeekStats, weekBucket, weekStreakNow } from '../shared/week.js';
import { weekTier } from '../shared/week.js';
import { ALLOWED, MODS, TYPES, cluesOut, compareWeek, difficulty, weekDayIndex, drawRules, readyTypes, isoWeek, isGuess, judge, makeWeek, publicSpec, rngFrom, weekStartDay } from '../shared/week.js';
import { consistentCodes } from '../shared/logic.js';

const bytesOf = n => Uint8Array.from({ length: 32 }, (_, i) => (n * 2654435761 + i * 40503) >>> (i % 24));

test('ISO weeks follow the calendar, including year boundaries', () => {
  assert.equal(isoWeek('2026-11-18'), '2026-W47');
  assert.equal(isoWeek('2026-11-16'), '2026-W47'); // Monday
  assert.equal(isoWeek('2026-11-22'), '2026-W47'); // Sunday
  assert.equal(isoWeek('2026-11-23'), '2026-W48');
  assert.equal(isoWeek('2027-01-01'), '2026-W53'); // Friday belongs to the previous ISO year
  assert.equal(isoWeek('2021-01-03'), '2020-W53');
  assert.equal(weekStartDay('2026-W47'), '2026-11-16');
  assert.equal(weekStartDay('2026-W53'), '2026-12-28');
});

test('the same seed always gives the same week', () => {
  assert.deepEqual(makeWeek(bytesOf(7)), makeWeek(bytesOf(7)));
});

test('draws respect the compatibility matrix and vary', () => {
  const seen = new Set();
  for (let n = 0; n < 10000; n++) {
    const { type, mods } = drawRules(rngFrom(bytesOf(n)), TYPES);
    assert.ok(TYPES.includes(type));
    assert.ok(mods.length <= 2);
    assert.equal(new Set(mods).size, mods.length);
    for (const m of mods) assert.ok(ALLOWED[type].includes(m), `${type}+${m}`);
    seen.add(`${type}:${mods.join('+')}`);
  }
  for (const m of MODS) assert.ok([...seen].some(k => k.includes(m)), `modifier ${m} never drawn`);
  for (const t of TYPES) assert.ok([...seen].some(k => k.startsWith(t)), `type ${t} never drawn`);
});

test('big vault codes fit their alphabet', () => {
  for (let n = 0; n < 300; n++) {
    const { spec, secret } = makeWeek(bytesOf(n), ['big']);
    assert.match(secret.code, spec.mods.includes('hex') ? /^[0-9A-F]{5}$/ : /^\d{6}$/);
  }
});

test('a cipher week publishes clues with exactly one solution, one try a day', () => {
  const { spec, secret } = makeWeek(bytesOf(4), ['cipher'], { type: 'cipher', mods: [] });
  assert.equal(spec.perDay, 1);
  assert.deepEqual(consistentCodes(spec.clues), [secret.code]);
  assert.ok(!JSON.stringify(publicSpec(spec)).includes(`"${secret.code}"`));
});

test('only ready types are drawn; a forced spec wins', () => {
  for (let n = 0; n < 200; n++) assert.equal(makeWeek(bytesOf(n), ['big']).spec.type, 'big');
  const { spec } = makeWeek(bytesOf(1), ['big'], { type: 'big', mods: ['hex', 'sum'] });
  assert.deepEqual(spec.mods, ['hex', 'sum']);
});

test('the public spec never carries the secret', () => {
  for (let n = 0; n < 500; n++) {
    const { spec, secret } = makeWeek(bytesOf(n), ['big']);
    const pub = JSON.stringify(publicSpec(spec));
    assert.ok(!pub.includes(secret.code));
    assert.ok(!('lieAt' in spec));
  }
});

test('sum modifier publishes the digit sum (hex digits by value)', () => {
  const { spec, secret } = makeWeek(bytesOf(3), ['big'], { type: 'big', mods: ['hex', 'sum'] });
  assert.equal(spec.sum, [...secret.code].reduce((s, c) => s + parseInt(c, 16), 0));
});

test('guesses are validated against length and alphabet', () => {
  const dec = { type: 'big', mods: [], len: 8, base: 10 };
  const hex = { type: 'big', mods: ['hex'], len: 6, base: 16 };
  assert.ok(isGuess(dec, '01234567'));
  assert.ok(!isGuess(dec, '0123456A'));
  assert.ok(!isGuess(dec, '0123456'));
  assert.ok(isGuess(hex, '0A9F3C'));
  assert.ok(!isGuess(hex, '0a9f3c'));
  assert.ok(!isGuess(hex, 12345678));
});

test('judge counts hits, and near only with mastermind', () => {
  const secret = { code: '12345678' };
  assert.deepEqual(judge({ type: 'big', mods: [], len: 8 }, secret, '12000000'), { hits: 2, solved: false });
  assert.deepEqual(judge({ type: 'big', mods: ['mastermind'], len: 8 }, secret, '21000008'), { hits: 1, near: 2, solved: false });
  assert.deepEqual(judge({ type: 'big', mods: [], len: 8 }, secret, '12345678'), { hits: 8, solved: true });
});

test('retired modifiers are never drawn: no liar anywhere, no timer on a cipher', () => {
  for (let n = 0; n < 5000; n++) {
    const { type, mods } = drawRules(rngFrom(bytesOf(n)), TYPES);
    assert.ok(!mods.includes('liar'));
    if (type === 'cipher') assert.ok(!mods.includes('timer'));
  }
});

test('cipher clues come out Monday to Thursday', () => {
  const spec = { type: 'cipher', mods: [], clues: Array.from({ length: 10 }, (_, i) => [String(i).repeat(5), 0]) };
  assert.deepEqual([0, 1, 2, 3, 6].map(d => publicSpec(spec, d).clues.length), [3, 5, 8, 10, 10]);
  assert.equal(publicSpec(spec, 0).cluesTotal, 10);
  assert.equal(publicSpec(spec).clues.length, 10); // a finished week shows them all
  assert.equal(cluesOut(1, 0), 1);
  assert.equal(weekDayIndex('2026-W47', '2026-11-16'), 0);
  assert.equal(weekDayIndex('2026-W47', '2026-11-22'), 6);
});

test('heist rations: more for hex, fewer with alarm', () => {
  const per = mods => makeWeek(bytesOf(2), TYPES, { type: 'heist', mods }).spec.perDay;
  assert.deepEqual([per([]), per(['hex']), per(['alarm']), per(['hex', 'alarm'])], [24, 36, 16, 24]);
});

test('difficulty label', () => {
  const d = (type, mods) => difficulty({ type, mods });
  assert.equal(d('big', ['sum']), 'easy');
  assert.equal(d('big', []), 'medium');
  assert.equal(d('heist', ['timer']), 'medium');
  assert.equal(d('big', ['hex']), 'hard');
  assert.equal(d('grid', []), 'hard');
});

test('ranking: solved by tries then time; timer by duration; unsolved by progress', () => {
  const rows = [
    { name: 'slow', solved: true, tries: 3, solvedAt: 900, firstAt: 800 },
    { name: 'fast', solved: true, tries: 3, solvedAt: 500, firstAt: 100 },
    { name: 'few', solved: true, tries: 2, solvedAt: 999, firstAt: 0 },
    { name: 'close', solved: false, tries: 9, progress: 6 },
    { name: 'far', solved: false, tries: 2, progress: 3 },
    { name: 'idle', solved: false, tries: 0, progress: 0 },
  ];
  const names = spec => [...rows].sort(compareWeek(spec)).map(r => r.name);
  assert.deepEqual(names({ mods: [] }), ['few', 'fast', 'slow', 'close', 'far', 'idle']);
  assert.deepEqual(names({ mods: ['timer'] }), ['slow', 'fast', 'few', 'close', 'far', 'idle']);
});

test('a type joins the draw only from its start week', () => {
  assert.deepEqual(readyTypes('2026-W40'), ['big']);
  assert.deepEqual(readyTypes('2026-W47'), ['big']);
  assert.deepEqual(readyTypes('2026-W48'), TYPES);
  assert.deepEqual(readyTypes('2027-W02'), TYPES);
});

test('a grid reports hits per row and column', () => {
  const { spec, secret } = makeWeek(bytesOf(2), ['grid'], { type: 'grid', mods: [] });
  assert.equal(spec.len, 25);
  assert.match(secret.code, /^\d{25}$/);
  const code = '1234567890123456789012345';
  const guess = '1200067000123006789900000'; // rows: 2, 3, 3, 4, 0
  const r = judge(spec, { code }, guess);
  assert.deepEqual(r.rows, [2, 3, 3, 4, 0]);
  assert.equal(r.cols.reduce((a, b) => a + b), r.hits);
  assert.equal(r.hits, 12);
  assert.equal(judge(spec, { code }, code).solved, true);
});

test('a heist chains five safes; each link is a real shared character', () => {
  for (let n = 0; n < 200; n++) {
    const { spec, secret } = makeWeek(bytesOf(n), ['heist'], { type: 'heist', mods: n % 2 ? ['hex', 'sum'] : [] });
    assert.equal(secret.codes.length, spec.safes);
    secret.codes.forEach(c => assert.ok(isGuess(spec, c)));
    secret.links.forEach(({ at, from }, i) => assert.equal(secret.codes[i + 1][at], secret.codes[i][from]));
    assert.ok(!('links' in spec));
    if (spec.sums) assert.equal(spec.sums.length, spec.safes);
  }
});

test('heist judging uses the safe being cracked', () => {
  const spec = { type: 'heist', mods: [], len: 4 };
  const secret = { codes: ['1234', '5678'] };
  assert.deepEqual(judge(spec, secret, '5600', secret.codes[1]), { hits: 2, solved: false });
  assert.deepEqual(judge(spec, secret, '1234', secret.codes[0]), { hits: 4, solved: true });
});

test('weekly stats: streak across consecutive weeks and the year boundary, buckets', () => {
  const empty = { won: 0, streak: 0, best: 0, last: null, hist: {} };
  let s = nextWeekStats(empty, '2026-W52', 3);
  s = nextWeekStats(s, '2026-W53', 12);
  s = nextWeekStats(s, '2027-W01', 30);
  assert.deepEqual(s, { won: 3, streak: 3, best: 3, last: '2027-W01', hist: { '1–5': 1, '11–15': 1, '21+': 1 } });
  assert.equal(nextWeekStats(s, '2027-W01', 1), s);
  assert.equal(weekStreakNow(s, '2027-W02'), 3);
  assert.equal(weekStreakNow(s, '2027-W03'), 0);
  assert.equal(nextWeekStats(s, '2027-W03', 5).streak, 1);
  assert.deepEqual([1, 5, 6, 20, 21].map(weekBucket), ['1–5', '1–5', '6–10', '16–20', '21+']);
});

test('alarm tightens the daily ration; nothing caps the week', () => {
  for (const type of TYPES) {
    const calm = makeWeek(bytesOf(5), [type], { type, mods: [] }).spec;
    assert.ok(calm.perDay > 0 && !('maxTries' in calm), type);
    if (type === 'cipher') continue;
    const alarm = makeWeek(bytesOf(5), [type], { type, mods: ['alarm'] }).spec;
    assert.ok(alarm.perDay > 0 && alarm.perDay < calm.perDay, type);
  }
});

test('the big safe is 6 digits (5 hex)', () => {
  assert.match(makeWeek(bytesOf(9), ['big'], { type: 'big', mods: [] }).secret.code, /^\d{6}$/);
  assert.match(makeWeek(bytesOf(9), ['big'], { type: 'big', mods: ['hex'] }).secret.code, /^[0-9A-F]{5}$/);
});

test('the automatic notepad keeps only codes that fit every try', async () => {
  const { candidates, padAllowed } = await import('../shared/week.js');
  const spec = { type: 'heist', mods: [], len: 4, base: 10 };
  const secret = { code: '1234' };
  const tries = ['1200', '5634', '1000'].map(guess => ({ guess, ...judge(spec, secret, guess) }));
  const all = candidates(spec, tries);
  assert.ok(all.left > 1);
  [...secret.code].forEach((c, i) => assert.ok(all.counts[i][+c] > 0)); // the real code always survives
  assert.equal(candidates(spec, tries, { sum: 10, fixed: { at: 3, char: '4' } }).counts[2][3] > 0, true);
  const exact = candidates(spec, [...tries, { guess: '1235', hits: 3 }, { guess: '1239', hits: 3 }, { guess: '1834', hits: 3 }, { guess: '7234', hits: 3 }]);
  assert.equal(exact.left, 1);

  const mm = { ...spec, mods: ['mastermind'] };
  const near = candidates(mm, [{ guess: '4321', ...judge(mm, secret, '4321') }]);
  assert.ok(near.left < candidates(spec, [{ guess: '4321', hits: 0 }]).left);

  assert.ok(padAllowed({ type: 'big', mods: [], len: 6, base: 10 }));
  assert.ok(padAllowed({ type: 'big', mods: ['hex'], len: 5, base: 16 }));
  assert.ok(!padAllowed({ type: 'big', mods: [], len: 8, base: 10 }));
  assert.ok(!padAllowed({ type: 'cipher', mods: [], len: 5, base: 10 }));
  assert.ok(!padAllowed({ type: 'grid', mods: [], len: 25, base: 10 }));
});

test('weekTier counts in days of the daily ration', () => {
  const spec = { perDay: 10 };
  assert.deepEqual([10, 11, 20, 21, 40, 41].map(n => weekTier(spec, n, false)), ['pink', 'gold', 'gold', 'purple', 'purple', 'blue']);
  assert.equal(weekTier({ perDay: 1 }, 1, false), 'pink'); // a cipher solved on the first day
  assert.equal(weekTier(spec, 3, true), 'silver');
});
