// Pure game rules, shared by the browser and the Worker.

export const LEN = 5;
const DAY_MS = 864e5;

/** One shared calendar for everyone: the server's clock in this timezone decides which safe is "today". */
export const GAME_TZ = 'Europe/Prague';
export const gameDay = (now = Date.now()) => new Date(now).toLocaleDateString('sv', { timeZone: GAME_TZ });

/** Milliseconds until the next safe, i.e. midnight in GAME_TZ. */
export function msUntilNextDay(now = Date.now()) {
  // A Date whose local fields read as wall-clock time in GAME_TZ; good enough for a countdown.
  const wall = new Date(new Date(now).toLocaleString('en-US', { timeZone: GAME_TZ }));
  return new Date(wall.getFullYear(), wall.getMonth(), wall.getDate() + 1) - wall;
}

/** Number of digits that match the code exactly by position. */
export const scoreOf = (guess, code) => [...guess].filter((d, i) => d === code[i]).length;

/** Shift a YYYY-MM-DD date string by n days (UTC-based, so DST never skews it). */
export const shiftDay = (day, n) => new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10);

/** Record a win for `day` solved in `tries` attempts. Returns the same object if the day already counted. */
export function nextStats(stats, day, tries) {
  if (stats.last === day) return stats;
  const streak = stats.last === shiftDay(day, -1) ? stats.streak + 1 : 1;
  const bucket = tries > 10 ? '11+' : String(tries);
  return {
    won: stats.won + 1,
    streak,
    best: Math.max(stats.best, streak),
    last: day,
    hist: { ...stats.hist, [bucket]: (stats.hist[bucket] || 0) + 1 },
  };
}

/** The streak as it should be displayed today: it lapses once a whole day is skipped. */
export const streakNow = (stats, day) => (stats.last === day || stats.last === shiftDay(day, -1) ? stats.streak : 0);

/**
 * Every code consistent with all `[guess, hits]` pairs.
 * Brute force over all 10^5 codes; takes a few milliseconds, cheaper than anything clever.
 */
export function consistentCodes(known) {
  const left = [];
  for (let i = 0; i < 10 ** LEN; i++) {
    const code = String(i).padStart(LEN, '0');
    if (known.every(([guess, hits]) => scoreOf(guess, code) === hits)) left.push(code);
  }
  return left;
}

/** For each slot, how many of `codes` have each digit there: counts[slot][digit]. */
export function digitCounts(codes) {
  const counts = Array.from({ length: LEN }, () => Array(10).fill(0));
  for (const code of codes) for (let p = 0; p < LEN; p++) counts[p][code[p]]++;
  return counts;
}

/** The day the game launched: day #001, and the oldest day the archive offers. */
export const FIRST_DAY = '2026-11-18';
const ARCHIVE_DAYS = 30;

export const dayNumber = day => Math.round((Date.parse(day) - Date.parse(FIRST_DAY)) / DAY_MS) + 1;

/** Past days that can still be replayed, newest first. They never count toward the streak or stats. */
export function archiveDays(today) {
  const days = [];
  for (let n = 1; n <= ARCHIVE_DAYS; n++) {
    const day = shiftDay(today, -n);
    if (day < FIRST_DAY) break;
    days.push(day);
  }
  return days;
}
