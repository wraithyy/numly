import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreOf, nextStats, streakNow, consistentCodes, digitCounts, tierOf } from '../shared/logic.js';
import { I18N, LANGS, detectLang, translator } from '../web/src/lib/i18n.js';

test('scoreOf counts exact positional matches only', () => {
  assert.equal(scoreOf('12345', '12345'), 5);
  assert.equal(scoreOf('12345', '54321'), 1);
  assert.equal(scoreOf('00000', '10000'), 4);
  assert.equal(scoreOf('98765', '12345'), 1);
});

test('nextStats builds streaks, counts a day once and resets after a gap', () => {
  let s = { won: 0, streak: 0, best: 0, last: null, hist: {} };
  s = nextStats(s, '2026-11-18', 3);
  assert.deepEqual([s.won, s.streak, s.hist['3']], [1, 1, 1]);
  s = nextStats(s, '2026-11-19', 12);
  assert.deepEqual([s.streak, s.best, s.hist['11+']], [2, 2, 1]);
  assert.equal(nextStats(s, '2026-11-19', 4), s);
  s = nextStats(s, '2026-11-21', 2);
  assert.deepEqual([s.won, s.streak, s.best], [3, 1, 2]);
});

test('streakNow lapses after a skipped day', () => {
  const s = { won: 1, streak: 4, best: 4, last: '2026-11-21', hist: {} };
  assert.equal(streakNow(s, '2026-11-22'), 4);
  assert.equal(streakNow(s, '2026-11-23'), 0);
});

test('consistentCodes narrows to codes matching every result', () => {
  const secret = '85822';
  const known = ['51221', '12235', '21258', '52335', '95448'].map(g => [g, scoreOf(g, secret)]);
  const left = consistentCodes(known);
  assert.ok(left.includes(secret));
  assert.ok(left.every(c => known.every(([g, h]) => scoreOf(g, c) === h)));
  assert.equal(consistentCodes([]).length, 100000);
});

test('digitCounts marks certain and impossible digits', () => {
  const counts = digitCounts(['12345', '12999']);
  assert.equal(counts[0][1], 2); // slot 1 is certainly 1
  assert.equal(counts[2][3], 1);
  assert.equal(counts[4][0], 0); // 0 is impossible in slot 5
});

test('every language has every key and covers its plural forms', () => {
  for (const lang of LANGS) {
    for (const key of Object.keys(I18N.en)) assert.ok(key in I18N[lang], `${lang}.${key} missing`);
    const t = translator(lang);
    for (const n of [1, 2, 5, 21, 2023]) assert.ok(t.codes(n), `${lang} plural for ${n}`);
  }
  assert.equal(detectLang(['de-AT', 'en']), 'de');
  assert.equal(detectLang(['ja']), 'en');
  assert.equal(translator('cs')('hits', { n: 3 }), 'Zapadlo 3 z 5 západek.');
});

test('the archive offers up to 30 past days, never before launch', async () => {
  const { archiveDays, dayNumber, FIRST_DAY } = await import('../shared/logic.js');
  assert.deepEqual(archiveDays(FIRST_DAY), []);
  assert.deepEqual(archiveDays('2026-11-20'), ['2026-11-19', '2026-11-18']);
  const late = archiveDays('2027-03-01');
  assert.equal(late.length, 30);
  assert.equal(late[0], '2027-02-28');
  assert.ok(!late.includes('2027-03-01'));
  assert.equal(dayNumber(FIRST_DAY), 1);
  assert.equal(dayNumber('2026-11-20'), 3);
});

test('tierOf: fewer tries, richer safe; the automatic notepad always gets silver', () => {
  assert.deepEqual([1, 10, 11, 14, 15, 20, 21, 60].map(n => tierOf(n, false)), ['pink', 'pink', 'gold', 'gold', 'purple', 'purple', 'blue', 'blue']);
  assert.equal(tierOf(3, true), 'silver');
});
