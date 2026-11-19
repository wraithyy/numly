// Daily game state and actions. Components render this state; the timing of the reveal
// (tumbler clicks, LEDs, the door) is driven from here.
import { LEN, archiveDays, consistentCodes, dayNumber, digitCounts, gameDay, nextStats } from '../../../shared/logic.js';
import { load, store } from '../lib/storage.js';
import { restartAnimation, vibrate } from '../lib/dom.js';
import { burst } from '../lib/fx.js';
import { sfx, ui } from '../lib/app.svelte.js';

export const today = gameDay(); // the server checks this against its own clock
// `/?day=YYYY-MM-DD` replays a past safe from the archive; anything else is today's.
const asked = new URLSearchParams(location.search).get('day');
export const archived = archiveDays(today).includes(asked);
export const day = archived ? asked : today;
export const dayNo = String(dayNumber(day)).padStart(3, '0');

// The code itself lives only on the server; we keep each guess and the hit count it returned.
const GAME_KEY = `numly2-${day}`;
const PAD_USED_KEY = `numly-pad-used-${day}`;
const PAD_ON_KEY = `numly-pad-on-${day}`; // per game: a new day starts with the notepad off
const saved = load(GAME_KEY, { guesses: [], hits: {} });

export const game = $state({
  guesses: saved.guesses,
  hits: saved.hits,
  rank: saved.rank ?? null, // { beaten, peers } from the server when the safe opened
  stats: load('numly-stats', { won: 0, streak: 0, best: 0, last: null, hist: {} }),
  padOn: load(PAD_ON_KEY, false),
  padUsed: load(PAD_USED_KEY, false),
  digits: Array(LEN).fill(''),
  leds: 0,
  ledsWin: false,
  wheel: 0,
  misses: 0, // guesses with no hit: the wheel catches on them
  msg: '',
  stamp: '',
  open: false,
  instant: false,
  newest: false, // highlight the newest history row (not on page load)
  busy: false,
});

/** Elements the reveal animates directly. */
export const refs = { cells: [], door: null, stamp: null, left: null, vault: null, fx: null };

export const score = guess => game.hits[guess] ?? 0;
export const won = () => game.guesses.length > 0 && score(game.guesses.at(-1)) === LEN;

/** Codes still consistent with today's results, computed only while the notepad is on. */
const padState = $derived.by(() => {
  if (!game.padOn) return null;
  const left = consistentCodes(game.guesses.map(g => [g, score(g)]));
  return { left: left.length, counts: digitCounts(left) };
});
export const pad = () => padState;

let friendsHook = { markPad() {}, guessInfo: () => ({}) };
export const connectFriends = hooks => (friendsHook = hooks);

/** Turning the notepad on before the safe is open marks today's result, even if it is switched off again. */
export function markPadUsed() {
  if (!game.padOn || game.padUsed || won()) return;
  game.padUsed = true;
  store(PAD_USED_KEY, true);
  if (!archived) friendsHook.markPad(); // friends see it right away, not only with the next guess
}

export function togglePad() {
  game.padOn = !game.padOn;
  store(PAD_ON_KEY, game.padOn);
  markPadUsed();
  sfx.key();
}

async function askSafe(guess) {
  const res = await fetch('/api/guess', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ day, guess, pad: game.padUsed, ...friendsHook.guessInfo() }),
  });
  const body = await res.json();
  if (!res.ok || !Number.isInteger(body.hits)) {
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { wrongDay: res.status === 409 });
  }
  return body;
}

// ---------------------------------------------------------------- input

const canEdit = () => !game.busy && !won();

/** Roll a digit like a combination lock: up from empty starts at 0, down from empty at 9. */
export function stepDigit(index, delta) {
  if (!canEdit()) return;
  const value = game.digits[index];
  const current = value === '' ? (delta > 0 ? -1 : 10) : Number(value);
  game.digits[index] = String((current + delta + 10) % 10);
  restartAnimation(refs.cells[index], delta > 0 ? 'roll-up' : 'roll-down');
  sfx.key();
  vibrate(5);
}

/** Typing or pasting spreads digits from `index` onwards. */
export function fillFrom(index, digits) {
  let k = 0;
  for (; k < digits.length && index + k < LEN; k++) {
    game.digits[index + k] = digits[k];
    restartAnimation(refs.cells[index + k], 'tap');
  }
  refs.cells[Math.min(index + k, LEN - 1)]?.focus();
  sfx.key();
}

/** Put a whole earlier guess back into the safe (history row). */
export function setGuess(guess) {
  if (!canEdit()) return;
  [...guess].forEach((d, i) => {
    game.digits[i] = d;
    restartAnimation(refs.cells[i], 'tap');
  });
  refs.cells[LEN - 1]?.focus({ preventScroll: true });
  sfx.key();
}

/** One digit from the notepad. No focus: it would scroll back up and pop up the phone keyboard. */
export function setDigit(index, digit) {
  if (!canEdit()) return;
  game.digits[index] = digit;
  restartAnimation(refs.cells[index], 'tap');
  sfx.key();
  vibrate(8);
}

// ---------------------------------------------------------------- a turn

function shake(message) {
  game.msg = message;
  restartAnimation(refs.door, 'shake');
  sfx.thud();
  vibrate([30, 40, 30]);
}

export async function submit() {
  if (!canEdit()) return;
  const t = ui.t;
  const guess = game.digits.join('');
  if (!/^\d{5}$/.test(guess)) {
    shake(t('missing'));
    (refs.cells.find((_, i) => !game.digits[i]) || refs.cells[0])?.focus();
    return;
  }

  game.busy = true;
  game.msg = t('listen');
  let hits, rank;
  try {
    ({ hits, rank = null } = await askSafe(guess));
  } catch (err) {
    console.error('Guess request failed:', err);
    game.busy = false;
    shake(t(err.wrongDay ? 'wrongDay' : 'offline'));
    return;
  }

  const previousBest = Math.max(0, ...game.guesses.map(score));
  // Saved right away, but shown (history, notepad, loot) only once the tumblers have clicked.
  game.hits[guess] = hits;
  if (hits === LEN) game.rank = rank;
  store(GAME_KEY, { guesses: [...game.guesses, guess], hits: game.hits, rank: game.rank });
  const reveal = () => game.guesses.push(guess);

  game.wheel += 360 + hits * 72;
  game.digits = Array(LEN).fill('');
  game.leds = 0;

  if (hits === 0) {
    game.misses++;
    setTimeout(() => {
      sfx.thud();
      reveal();
      endTurn(t('zero'));
    }, 400);
    return;
  }
  // Light the tumblers one by one, each with its own click.
  for (let k = 0; k < hits; k++) {
    setTimeout(() => {
      game.leds = k + 1;
      sfx.click();
      vibrate(18);
      if (k === hits - 1) {
        reveal();
        revealResult(hits, previousBest);
      }
    }, 380 + k * 210);
  }
}

function revealResult(hits, previousBest) {
  const t = ui.t;
  if (hits === LEN) return win();
  const isRecord = hits > previousBest && game.guesses.length > 1;
  if (isRecord) {
    setTimeout(() => {
      game.stamp = t('record', { n: hits });
      restartAnimation(refs.stamp, 'show');
      sfx.chime();
      vibrate([20, 60, 20]);
    }, 250);
  }
  endTurn(t('hits', { n: hits }) + (isRecord ? ` ${t('recordMsg')}` : ''));
}

function endTurn(message) {
  game.newest = true;
  restartAnimation(refs.left, 'pulse');
  game.msg = padState?.left === 1 ? `${message} ${ui.t('oneLeft')}` : message;
  game.busy = false;
  refs.cells[0]?.focus();
}

function win() {
  if (!archived) {
    game.stats = nextStats(game.stats, today, game.guesses.length);
    store('numly-stats', game.stats);
  }
  game.newest = true;
  game.ledsWin = true;
  game.msg = '';
  sfx.open();
  vibrate([40, 80, 40, 80, 200]);
  setTimeout(() => {
    game.open = true;
    const r = refs.vault.getBoundingClientRect();
    burst(refs.fx, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    game.busy = false;
  }, 650);
}

// ---------------------------------------------------------------- boot

if (won()) {
  game.leds = LEN;
  game.open = true;
  game.instant = true;
} else {
  game.leds = game.guesses.length ? score(game.guesses.at(-1)) : 0;
}
