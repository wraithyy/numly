// Weekly game rules, shared by the Worker, the browser and the tests.
// A week = one game type + 0-2 modifiers, all drawn from secret bytes (HMAC of the week), so the
// draw is random but identical for everyone. The spec is public; the secret stays on the server.
import { LEN, gameDay, shiftDay } from './logic.js';
import { makeCipher } from './cipher.js';

export const TYPES = ['big', 'cipher', 'grid', 'heist'];
export const MODS = ['hex', 'liar', 'sum', 'mastermind', 'alarm', 'timer'];
export const ALLOWED = {
  big: MODS,
  cipher: ['sum', 'timer'], // clues must stay truthful and the try limit is built in
  grid: ['alarm', 'timer'],
  heist: MODS,
};
/**
 * The week each type joins the draw. A running week must never change its draw, so a new type
 * only enters from a future week; ISO week strings compare correctly as plain strings.
 */
export const READY_FROM = { big: '2026-W47', cipher: '2026-W48', grid: '2026-W48', heist: '2026-W48' };
export const readyTypes = week => {
  const ready = Object.keys(READY_FROM).filter(type => READY_FROM[type] <= week);
  return ready.length ? ready : ['big'];
};

const MAX_MODS = 2;
// The weekly game never locks: it is rationed per day so it is worth coming back to.
// A methodical player needs ~24 tries for 8 digits, a casual one two or three times that,
// so the ration lets the first finish in a few days and the second by Sunday. Alarm tightens it.
const PER_DAY = { big: 10, grid: 8, heist: 15, cipher: 1 }; // cipher: the clues decide it
const ALARM_PER_DAY = { big: 7, grid: 6, heist: 10 };
const GRID_SIZE = 5;
const HEIST_SAFES = 5;
const HEIST_LEN = 4;
const DIGITS = '0123456789ABCDEF';

// ---------------------------------------------------------------- calendar

/** ISO week ('2026-W47') of a YYYY-MM-DD day. */
export function isoWeek(day) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)); // the week's Thursday decides the year
  const year = d.getUTCFullYear();
  const week = 1 + Math.floor((d - Date.UTC(year, 0, 1)) / 864e5 / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The game week, decided like the game day: by the clock in Europe/Prague. */
export const gameWeek = (now = Date.now()) => isoWeek(gameDay(now));

/** Monday (YYYY-MM-DD) of an ISO week. */
export function weekStartDay(week) {
  const [year, w] = week.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = Date.UTC(year, 0, 4 - ((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  return new Date(monday).toISOString().slice(0, 10);
}

export const previousWeek = week => isoWeek(shiftDay(weekStartDay(week), -7));

// ---------------------------------------------------------------- stats (kept in the browser, like the daily ones)

export const WEEK_BUCKETS = ['1–5', '6–10', '11–15', '16–20', '21+'];
export const weekBucket = tries => (tries > 20 ? '21+' : WEEK_BUCKETS[Math.floor((tries - 1) / 5)]);

/** Record a solved week. Returns the same object if the week already counted. */
export function nextWeekStats(stats, week, tries) {
  if (stats.last === week) return stats;
  const streak = stats.last === previousWeek(week) ? stats.streak + 1 : 1;
  const bucket = weekBucket(tries);
  return {
    won: stats.won + 1,
    streak,
    best: Math.max(stats.best, streak),
    last: week,
    hist: { ...stats.hist, [bucket]: (stats.hist[bucket] || 0) + 1 },
  };
}

/** The weekly streak as shown now: it lapses once a whole week is skipped. */
export const weekStreakNow = (stats, week) => (stats.last === week || stats.last === previousWeek(week) ? stats.streak : 0);

// ---------------------------------------------------------------- the draw

/** sfc32 seeded with 128 bits of the secret bytes: deterministic, and unguessable without them. */
export function rngFrom(bytes) {
  let [a, b, c, d] = [0, 4, 8, 12].map(i => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0);
  return () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
}

const pick = (rng, list) => list[rng() % list.length];

function drawMods(rng, type) {
  const pool = [...ALLOWED[type]];
  const count = rng() % (MAX_MODS + 1);
  const mods = [];
  for (let i = 0; i < count; i++) mods.push(...pool.splice(rng() % pool.length, 1));
  // Mastermind's "elsewhere" count would expose which try the liar shifted; the liar wins.
  // Dropped without another rng call, so every other draw stays exactly as it was.
  const kept = mods.includes('liar') ? mods.filter(m => m !== 'mastermind') : mods;
  return kept.sort((x, y) => MODS.indexOf(x) - MODS.indexOf(y));
}

const randomCode = (rng, len, base) => Array.from({ length: len }, () => DIGITS[rng() % base]).join('');
const digitSum = code => [...code].reduce((s, c) => s + parseInt(c, 16), 0);

/** Type and modifiers only: cheap, so the draw itself can be tested over many seeds. */
export function drawRules(rng, ready) {
  const type = pick(rng, ready);
  return { type, mods: drawMods(rng, type) };
}

/**
 * The week's game from its secret bytes. `force` ({ type, mods }) pins the draw for local testing.
 * Returns { spec, secret }: spec is safe to publish (see publicSpec), secret never leaves the server.
 */
export function makeWeek(bytes, ready = ['big'], force = null, week = null) {
  const rng = rngFrom(bytes);
  const { type, mods } = force ?? drawRules(rng, ready);
  const has = m => mods.includes(m);

  if (type === 'cipher') {
    const code = randomCode(rng, LEN, 10); // cipher.js searches codes of the daily length
    const sum = has('sum') ? { sum: digitSum(code) } : {};
    const clues = makeCipher(rng, code, has('sum'));
    return { spec: { type, mods, len: LEN, base: 10, perDay: PER_DAY.cipher, clues, ...sum }, secret: { code } };
  }

  if (type === 'grid') {
    const code = randomCode(rng, GRID_SIZE * GRID_SIZE, 10);
    const spec = { type, mods, len: code.length, base: 10, size: GRID_SIZE, ...limits(type, has('alarm')) };
    return { spec, secret: { code } };
  }

  if (type === 'heist') return makeHeist(rng, type, mods);

  const base = has('hex') ? 16 : 10;
  // Eight digits proved too many to hold in your head. ponytail: the W47 branch keeps that live week's
  // code; delete it once W47 is no longer shown as last week (from 2026-W49).
  const len = week && week < '2026-W48' ? (base === 16 ? 6 : 8) : base === 16 ? 5 : 6;
  const code = randomCode(rng, len, base);
  const spec = {
    type,
    mods,
    len,
    base,
    ...limits(type, has('alarm')),
    ...(has('sum') && { sum: digitSum(code) }),
  };
  const secret = { code, ...(has('liar') && drawLie(rng)) };
  return { spec, secret };
}

const limits = (type, alarm) => ({ perDay: (alarm ? ALARM_PER_DAY : PER_DAY)[type] });

const drawLie = rng => ({ lieAt: 2 + (rng() % 5), lieDir: rng() % 2 ? 1 : -1 });

/**
 * A chain of safes. Each safe shares one character with the previous one; that link is part of the
 * secret and is shown to a player only once they open the earlier safe.
 */
function makeHeist(rng, type, mods) {
  const has = m => mods.includes(m);
  const base = has('hex') ? 16 : 10;
  const codes = [randomCode(rng, HEIST_LEN, base)];
  const links = [];
  for (let i = 1; i < HEIST_SAFES; i++) {
    const at = rng() % HEIST_LEN;
    const from = rng() % HEIST_LEN;
    const chars = [...randomCode(rng, HEIST_LEN, base)];
    chars[at] = codes[i - 1][from];
    codes.push(chars.join(''));
    links.push({ at, from });
  }
  const spec = {
    type,
    mods,
    len: HEIST_LEN,
    base,
    safes: HEIST_SAFES,
    ...limits(type, has('alarm')),
    ...(has('sum') && { sums: codes.map(digitSum) }),
  };
  return { spec, secret: { codes, links, ...(has('liar') && drawLie(rng)) } };
}

/** The spec as players see it. Today identical to spec; kept as the one place that decides. */
export const publicSpec = spec => ({ ...spec });

// ---------------------------------------------------------------- a guess

export function isGuess(spec, guess) {
  if (typeof guess !== 'string' || guess.length !== spec.len) return false;
  const allowed = DIGITS.slice(0, spec.base ?? 10);
  return [...guess].every(c => allowed.includes(c));
}

/** Matches by multiset, regardless of position. */
function common(a, b) {
  const counts = {};
  for (const c of a) counts[c] = (counts[c] || 0) + 1;
  let n = 0;
  for (const c of b) if (counts[c] > 0) { counts[c]--; n++; }
  return n;
}

/**
 * Feedback for try number `tryNo` (1-based) against `code` (for a heist: the safe being cracked).
 * The liar shifts the hit count of try `lieAt` by one; it never lies on the solving guess,
 * and flips direction rather than leave the valid range. A grid also reports hits per row and column.
 */
export function judge(spec, secret, guess, tryNo, code = secret.code) {
  const solved = guess === code;
  const exact = [...guess].map((c, i) => c === code[i]);
  const trueHits = exact.filter(Boolean).length;
  let hits = trueHits;
  if (!solved && spec.mods.includes('liar') && tryNo === secret.lieAt) {
    const shifted = hits + secret.lieDir;
    hits = shifted < 0 || shifted >= spec.len ? hits - secret.lieDir : shifted;
  }
  if (spec.type === 'grid') {
    const rows = Array(spec.size).fill(0);
    const cols = Array(spec.size).fill(0);
    exact.forEach((hit, i) => {
      if (!hit) return;
      rows[Math.floor(i / spec.size)]++;
      cols[i % spec.size]++;
    });
    return { hits, rows, cols, solved };
  }
  if (spec.mods.includes('mastermind')) return { hits, near: common(guess, code) - trueHits, solved };
  return { hits, solved };
}

// ---------------------------------------------------------------- ranking

/**
 * Friends board order. Solved first: fewest tries, then earliest solve; with `timer`, the
 * shortest first-try-to-solve duration wins and tries break ties. Unsolved: playing before idle, then most progress.
 */
export const compareWeek = spec => (a, b) => {
  if (a.solved !== b.solved) return a.solved ? -1 : 1;
  if (!a.solved) return Number(b.tries > 0) - Number(a.tries > 0) || (b.progress ?? 0) - (a.progress ?? 0) || a.tries - b.tries;
  if (spec.mods.includes('timer')) return a.solvedAt - a.firstAt - (b.solvedAt - b.firstAt) || a.tries - b.tries;
  return a.tries - b.tries || a.solvedAt - b.solvedAt;
};
