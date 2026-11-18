// Cipher puzzles: a list of public clues ([guess, hits]) that leave exactly one possible code.
import { LEN, scoreOf } from './logic.js';

const ALL_CODES = Array.from({ length: 10 ** LEN }, (_, i) => String(i).padStart(LEN, '0'));
const digitSum = code => [...code].reduce((s, c) => s + Number(c), 0);

const SAMPLES = 8;

/**
 * Adds clues until only `code` is consistent; each step keeps the most narrowing of a few random
 * guesses, which keeps puzzles short. `sumKnown`: the digit sum is public, so it narrows the field up front.
 */
export function makeCipher(rng, code, sumKnown = false) {
  let left = sumKnown ? ALL_CODES.filter(c => digitSum(c) === digitSum(code)) : ALL_CODES;
  const clues = [];
  for (let step = 0; left.length > 1 && step < 200; step++) {
    let best = null;
    for (let k = 0; k < SAMPLES; k++) {
      const guess = String(rng() % 10 ** LEN).padStart(LEN, '0');
      if (guess === code) continue;
      const hits = scoreOf(guess, code);
      const next = left.filter(c => scoreOf(guess, c) === hits);
      if (!best || next.length < best.next.length) best = { guess, hits, next };
    }
    if (best && best.next.length < left.length) {
      clues.push([best.guess, best.hits]);
      left = best.next;
    }
  }
  return clues;
}
