// Weekly game on the server: the draw, try limits, judging and the friends board.
// Runs inside the Social Durable Object, so checking a limit and recording a try is one atomic step.
import { compareWeek, gameWeek, isGuess, isoWeek, judge, makeWeek, previousWeek, publicSpec, readyTypes } from '../shared/week.js';
import { gameDay, shiftDay } from '../shared/logic.js';

const KEEP_WEEKS = 3;
const enc = new TextEncoder();

export const WEEK_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS week_tries (
     week TEXT NOT NULL, pub TEXT NOT NULL, n INTEGER NOT NULL,
     guess TEXT NOT NULL, hits INTEGER NOT NULL, near INTEGER, solved INTEGER NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL,
     PRIMARY KEY (week, pub, n))`,
  // The public spec of each week, so the live board can be built synchronously.
  `CREATE TABLE IF NOT EXISTS week_meta (week TEXT PRIMARY KEY, spec TEXT NOT NULL)`,
];

// Added after the first release; each fails harmlessly once the column exists.
export const WEEK_MIGRATIONS = [
  `ALTER TABLE week_tries ADD COLUMN detail TEXT`, // grid: { rows, cols }; heist: { safe, opened }
  `ALTER TABLE week_tries ADD COLUMN progress INTEGER`, // board progress: best hits, or safes opened in a heist
];

/** The answer as shown once the week is over. */
const answerOf = secret => secret.code ?? secret.codes.join(' ');

export { previousWeek };

/** Local testing only (.dev.vars); a malformed value is ignored rather than breaking the game. */
function forcedSpec(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.error('Ignoring malformed WEEK_SPEC');
    return null;
  }
}

/** The week's game from HMAC(secret, 'week:' + week). `WEEK_SPEC` (JSON, local only) pins the draw. */
export async function weekGame(env, week) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`week:${week}`)));
  return makeWeek(bytes, readyTypes(week), forcedSpec(env.WEEK_SPEC));
}

export class Weekly {
  /** @param {{ q: Function }} db  the Durable Object's query helper */
  constructor(db, env) {
    this.db = db;
    this.env = env;
  }

  async game(week) {
    // A cipher week costs ~40 ms to generate; the Durable Object stays in memory between requests.
    this.cache ??= new Map();
    if (this.cache.has(week)) return this.cache.get(week);
    const game = await weekGame(this.env, week);
    this.cache.set(week, game);
    this.db.q(`INSERT OR REPLACE INTO week_meta (week, spec) VALUES (?, ?)`, week, JSON.stringify(publicSpec(game.spec)));
    return game;
  }

  tries(week, pub) {
    return this.db
      .q(`SELECT guess, hits, near, solved, day, at, detail FROM week_tries WHERE week = ? AND pub = ? ORDER BY n`, week, pub)
      .map(t => ({ ...t, detail: t.detail ? JSON.parse(t.detail) : null }));
  }

  /** Heist: safes opened so far, i.e. the index of the safe being cracked. */
  opened(week, pub) {
    return this.tries(week, pub).filter(t => t.detail?.opened).length;
  }

  /** What a player sees: the spec, their own tries, what they may still do, and last week's answer. */
  async view(pub, week = gameWeek(), today = gameDay()) {
    const { spec, secret } = await this.game(week);
    const tries = this.tries(week, pub).map(t => ({ guess: t.guess, hits: t.hits, ...(t.near !== null && { near: t.near }), ...t.detail, solved: Boolean(t.solved) }));
    // A heist link is revealed only once the safe it starts from is open.
    const opened = spec.type === 'heist' ? this.opened(week, pub) : null;
    const heist = spec.type === 'heist' ? { current: opened, links: secret.links.slice(0, opened) } : {};
    const last = previousWeek(week);
    const lastGame = await this.game(last);
    return {
      week,
      spec: publicSpec(spec),
      tries,
      ...(opened !== null && { heist }),
      ...this.limits(spec, week, pub, today),
      last: { week: last, spec: publicSpec(lastGame.spec), code: answerOf(lastGame.secret) },
    };
  }

  limits(spec, week, pub, today) {
    const all = this.tries(week, pub);
    const solved = all.some(t => t.solved);
    return { solved, todayLeft: Math.max(0, spec.perDay - all.filter(t => t.day === today).length) };
  }

  /** Returns { status, body }. 409: another week or already solved; 429: out of tries for today. */
  async guess(pub, week, guess, now = Date.now()) {
    const current = gameWeek(now);
    if (week !== current) return { status: 409, body: { error: 'wrong week', week: current } };
    const { spec, secret } = await this.game(week);
    if (!isGuess(spec, guess)) return { status: 400, body: { error: 'invalid guess' } };
    const today = gameDay(now);
    const limits = this.limits(spec, week, pub, today);
    if (limits.solved) return { status: 409, body: { error: 'solved' } };
    if (limits.todayLeft === 0) return { status: 429, body: { error: 'no tries left', ...limits } };

    const n = this.tries(week, pub).length + 1;
    const { result, detail, solved, progress } = this.score(spec, secret, week, pub, guess, n);
    this.db.q(
      `INSERT INTO week_tries (week, pub, n, guess, hits, near, solved, day, at, detail, progress) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      week, pub, n, guess, result.hits, result.near ?? null, solved ? 1 : 0, today, now, detail && JSON.stringify(detail), progress,
    );
    return { status: 200, body: { result, ...(await this.view(pub, week, today)) } };
  }

  /** Judges one try. A heist try opens at most the current safe; the week is solved with the last one. */
  score(spec, secret, week, pub, guess, n) {
    if (spec.type === 'heist') {
      const safe = this.opened(week, pub);
      const result = judge(spec, secret, guess, n, secret.codes[safe]);
      const opened = safe + (result.solved ? 1 : 0);
      const solved = opened === spec.safes;
      return { result: { ...result, safe, opened: result.solved, solved }, detail: { safe, opened: result.solved }, solved, progress: opened };
    }
    const result = judge(spec, secret, guess, n);
    const detail = spec.type === 'grid' ? { rows: result.rows, cols: result.cols } : null;
    return { result, detail, solved: result.solved, progress: result.hits };
  }

  /** Friends board for the current week (null until someone has opened it). Built synchronously for the live feed. */
  board(pub, week = gameWeek()) {
    const meta = this.db.q(`SELECT spec FROM week_meta WHERE week = ?`, week)[0];
    if (!meta) return null;
    const spec = JSON.parse(meta.spec);
    const rows = this.db
      .q(
        `SELECT p.pub, p.name, COUNT(t.n) AS tries, COALESCE(MAX(t.solved), 0) AS solved,
                MIN(t.at) AS firstAt, MAX(CASE WHEN t.solved = 1 THEN t.at END) AS solvedAt, COALESCE(MAX(COALESCE(t.progress, t.hits)), 0) AS progress
         FROM players p LEFT JOIN week_tries t ON t.pub = p.pub AND t.week = ?
         WHERE p.pub = ? OR p.pub IN (SELECT b FROM friends WHERE a = ?)
         GROUP BY p.pub`,
        week, pub, pub,
      )
      .map(r => ({ ...r, solved: Boolean(r.solved) }))
      .sort(compareWeek(spec));
    return { week, mods: spec.mods, rows };
  }

  cleanup(today = gameDay()) {
    const oldest = isoWeek(shiftDay(today, -7 * KEEP_WEEKS));
    this.db.q(`DELETE FROM week_tries WHERE week < ?`, oldest);
    this.db.q(`DELETE FROM week_meta WHERE week < ?`, oldest);
  }
}
