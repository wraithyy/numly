import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCipher } from '../shared/cipher.js';
import { consistentCodes } from '../shared/logic.js';

const seq = seed => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0); };
const sumOf = code => [...code].reduce((a, c) => a + Number(c), 0);

test('every puzzle has exactly one solution: the code', () => {
  for (let n = 1; n <= 40; n++) {
    const rng = seq(n);
    const code = String(rng() % 1e5).padStart(5, '0');
    const clues = makeCipher(rng, code);
    assert.deepEqual(consistentCodes(clues), [code], `seed ${n}`);
    assert.ok(clues.length <= 14, `seed ${n}: ${clues.length} clues`);
    for (const [g] of clues) assert.notEqual(g, code);
  }
});

test('a public digit sum counts as a clue', () => {
  const rng = seq(5);
  const code = '40712';
  const clues = makeCipher(rng, code, true);
  const left = consistentCodes(clues).filter(c => sumOf(c) === sumOf(code));
  assert.deepEqual(left, [code]);
});

test('deterministic for a given random stream, and fast', () => {
  assert.deepEqual(makeCipher(seq(9), '13579'), makeCipher(seq(9), '13579'));
  const start = performance.now();
  for (let n = 0; n < 20; n++) makeCipher(seq(100 + n), '24680');
  assert.ok((performance.now() - start) / 20 < 200);
});
