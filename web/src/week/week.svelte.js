// Weekly game state. The server holds everything (tries, limits, the code); this mirrors its view
// and runs the reveal. Tries are stored server-side, so the week continues on any device.
import { gameDay, msUntilNextDay } from '../../../shared/logic.js';
import { restartAnimation, vibrate } from '../lib/dom.js';
import { burst } from '../lib/fx.js';
import { load, store } from '../lib/storage.js';
import { player, sfx, ui } from '../lib/app.svelte.js';
import { friends } from '../lib/friends.svelte.js';
import { nextWeekStats, padAllowed } from '../../../shared/week.js';

const DIGITS = '0123456789ABCDEF';

export const wk = $state({
  view: null, // { week, spec, tries, solved, todayLeft, last }
  error: null,
  digits: [],
  leds: 0,
  near: null,
  wheel: 0,
  msg: '',
  open: false,
  instant: false,
  newest: false,
  busy: false,
  stats: load('numly-week-stats', { won: 0, streak: 0, best: 0, last: null, hist: {} }),
  padOn: load('numly-week-pad', false), // the automatic notepad, a preference across weeks
  padUsed: false, // sticky for the week once switched on: every later try carries it
});

export const refs = { cells: [], door: null, vault: null, fx: null };

/** Remembered per week so the daily page can show a dot until the week is solved. */
export const weekDoneKey = week => `numly-week-done-${week}`;
const padUsedKey = week => `numly-week-pad-used-${week}`;

async function api(body) {
  const res = await fetch('/api/week', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ player, name: friends.name || undefined, pad: wk.padUsed, ...body }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

function apply(view, instant) {
  wk.view = view;
  wk.padUsed = load(padUsedKey(view.week), false);
  markPadUsed();
  wk.digits = Array(view.spec.len).fill('');
  const lastTry = view.tries.at(-1);
  wk.leds = lastTry?.hits ?? 0;
  wk.near = lastTry?.near ?? null;
  if (view.solved) {
    wk.open = true;
    wk.instant = instant;
    store(weekDoneKey(view.week), true);
    // Also counts a week solved on another device: tries live on the server.
    wk.stats = nextWeekStats(wk.stats, view.week, view.tries.length);
    store('numly-week-stats', wk.stats);
  }
}

export async function loadWeek() {
  try {
    const { ok, data } = await api({ action: 'view' });
    if (!ok) throw new Error(data.error);
    apply(data, true);
  } catch (err) {
    console.error('Week view failed:', err);
    wk.error = 'offline';
  }
}

// ---------------------------------------------------------------- input

const base = () => wk.view?.spec.base ?? 10;
const canEdit = () => wk.view && !wk.busy && !wk.view.solved;

export const isChar = c => DIGITS.slice(0, base()).includes(c.toUpperCase());

export function stepChar(index, delta) {
  if (!canEdit()) return;
  const b = base();
  const value = wk.digits[index];
  const current = value === '' ? (delta > 0 ? -1 : b) : DIGITS.indexOf(value);
  wk.digits[index] = DIGITS[(current + delta + b) % b];
  restartAnimation(refs.cells[index], delta > 0 ? 'roll-up' : 'roll-down');
  sfx.key();
  vibrate(5);
}

export function fillFrom(index, chars) {
  if (!canEdit()) return;
  const len = wk.view.spec.len;
  let k = 0;
  for (; k < chars.length && index + k < len; k++) {
    wk.digits[index + k] = chars[k].toUpperCase();
    restartAnimation(refs.cells[index + k], 'tap');
  }
  refs.cells[Math.min(index + k, len - 1)]?.focus();
  sfx.key();
}

export function setGuess(guess) {
  if (!canEdit()) return;
  wk.digits = [...guess];
  refs.cells.forEach(c => restartAnimation(c, 'tap'));
  refs.cells.at(-1)?.focus({ preventScroll: true });
  sfx.key();
}

/** Switching the notepad on before the week is solved marks it, even if it is switched off again. */
function markPadUsed() {
  if (!wk.padOn || wk.padUsed || !wk.view || wk.view.solved || !padAllowed(wk.view.spec)) return;
  wk.padUsed = true;
  store(padUsedKey(wk.view.week), true);
}

export function togglePad() {
  wk.padOn = !wk.padOn;
  store('numly-week-pad', wk.padOn);
  markPadUsed();
  sfx.key();
}

// ---------------------------------------------------------------- a turn

function shake(message) {
  wk.msg = message;
  restartAnimation(refs.door, 'shake');
  sfx.thud();
  vibrate([30, 40, 30]);
}

export async function submit() {
  if (!canEdit()) return;
  const t = ui.t;
  const { spec, week } = wk.view;
  const guess = wk.digits.join('');
  if (guess.length !== spec.len) {
    shake(t('weekMissing', { len: spec.len }));
    return;
  }
  if (wk.view.todayLeft === 0) return shake(t('noneToday'));

  wk.busy = true;
  wk.msg = t('listen');
  let res;
  try {
    res = await api({ action: 'guess', week, guess });
  } catch (err) {
    console.error('Week guess failed:', err);
    wk.busy = false;
    return shake(t('offline'));
  }
  if (!res.ok) {
    wk.busy = false;
    if (res.status === 429) {
      wk.view = { ...wk.view, ...res.data };
      return shake(t('noneToday'));
    }
    if (res.status === 409 && res.data.error === 'solved') return loadWeek(); // solved on another device
    return shake(t(res.status === 409 && res.data.error === 'wrong week' ? 'wrongWeek' : 'offline'));
  }

  const { result, ...view } = res.data;
  wk.wheel += 360 + result.hits * 45;
  wk.digits = Array(spec.len).fill('');
  wk.leds = 0;
  wk.near = null;
  const reveal = () => {
    wk.view = view;
    wk.near = result.near ?? null;
    if (result.solved) return win(view);
    wk.newest = true;
    if (result.opened) {
      // Heist: one safe down, the chain moves on to the next.
      wk.msg = t('safeOpened', { s: safeLetter(result.safe) });
      wk.leds = 0;
      sfx.chime();
      vibrate([20, 60, 20]);
      wk.busy = false;
      refs.cells[0]?.focus();
      return;
    }
    const near = result.near ? ` ${t('weekNear', { n: result.near })}.` : '';
    wk.msg = t('weekHits', { n: result.hits, len: spec.len }) + near;
    wk.busy = false;
    refs.cells[0]?.focus();
  };
  if (result.hits === 0) return setTimeout(() => { sfx.thud(); reveal(); }, 400);
  for (let k = 0; k < result.hits; k++) {
    setTimeout(() => {
      wk.leds = k + 1;
      sfx.click();
      vibrate(18);
      if (k === result.hits - 1) reveal();
    }, 380 + k * Math.min(160, 1500 / result.hits)); // a grid can light 25: keep the reveal short
  }
}

function win(view) {
  wk.newest = true;
  wk.msg = '';
  store(weekDoneKey(view.week), true);
  sfx.open();
  vibrate([40, 80, 40, 80, 200]);
  setTimeout(() => {
    apply(view, false);
    const r = refs.vault.getBoundingClientRect();
    burst(refs.fx, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    wk.busy = false;
  }, 650);
}

/** Milliseconds until Monday 00:00 in the game timezone. Off by an hour across a DST switch; fine for a countdown. */
export function msUntilNextWeek(now = Date.now()) {
  const dow = (new Date(`${gameDay(now)}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return msUntilNextDay(now) + (6 - dow) * 864e5;
}

export const weekDone = week => load(weekDoneKey(week), false);

export const safeLetter = i => String.fromCharCode(65 + i);
