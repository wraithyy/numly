// The social graph and daily results in one SQLite-backed Durable Object.
// Friendships are mutual: opening someone's link sends a request they accept or decline,
// and only friends see each other's results. Tries are counted from real guesses on the server.
import { MAX_FRIENDS, cleanName, compareRows, isPlayer, isPub, publicId } from '../shared/friends.js';
import { gameDay, shiftDay } from '../shared/logic.js';
import { WEEK_MIGRATIONS, WEEK_SCHEMA, Weekly } from './weekly.js';

const MAX_PENDING = 50;
const KEEP_DAYS = 3;
const DAY_MS = 864e5;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (pub TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS requests (from_pub TEXT NOT NULL, to_pub TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (from_pub, to_pub))`,
  // Each friendship is stored in both directions so "friends of X" is a single indexed lookup.
  `CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL, b TEXT NOT NULL, PRIMARY KEY (a, b))`,
  `CREATE TABLE IF NOT EXISTS results (
     day TEXT NOT NULL, pub TEXT NOT NULL,
     tries INTEGER NOT NULL DEFAULT 0, solved INTEGER NOT NULL DEFAULT 0, pad INTEGER NOT NULL DEFAULT 0, solved_at INTEGER,
     PRIMARY KEY (day, pub))`,
];

export class Social {
  constructor(ctx, env) {
    this.ctx = ctx;
    for (const stmt of [...SCHEMA, ...WEEK_SCHEMA]) ctx.storage.sql.exec(stmt);
    for (const stmt of WEEK_MIGRATIONS) {
      try {
        ctx.storage.sql.exec(stmt);
      } catch (err) {
        if (!/duplicate column/i.test(String(err?.message))) throw err; // already migrated
      }
    }
    this.weekly = new Weekly(this, env);
  }

  q(query, ...params) {
    return this.ctx.storage.sql.exec(query, ...params).toArray();
  }

  // ------------------------------------------------------------ writes

  touch(pub, name) {
    if (name) this.q(`INSERT INTO players (pub, name) VALUES (?, ?) ON CONFLICT(pub) DO UPDATE SET name = excluded.name`, pub, name);
    else this.q(`INSERT OR IGNORE INTO players (pub) VALUES (?)`, pub);
  }

  /** Count one guess. Right-hand sides in an UPDATE see the old row, so a solved day stops counting. */
  recordGuess({ pub, name, pad, hits, at }, day = gameDay(at)) {
    this.touch(pub, name);
    const solved = hits === 5 ? 1 : 0;
    this.q(
      `INSERT INTO results (day, pub, tries, solved, pad, solved_at) VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT(day, pub) DO UPDATE SET
         tries = tries + (1 - solved),
         pad = MAX(pad, excluded.pad),
         solved_at = CASE WHEN solved = 0 THEN excluded.solved_at ELSE solved_at END,
         solved = MAX(solved, excluded.solved)`,
      day, pub, solved, pad ? 1 : 0, solved ? at : null,
    );
  }

  markPad(pub, day = gameDay()) {
    this.q(`INSERT INTO results (day, pub, pad) VALUES (?, ?, 1) ON CONFLICT(day, pub) DO UPDATE SET pad = 1`, day, pub);
  }

  friendCount(pub) {
    return this.q(`SELECT COUNT(*) AS n FROM friends WHERE a = ?`, pub)[0].n;
  }

  /** Returns 'sent' | 'accepted' | 'friends' | 'self' | 'unknown' | 'full'. */
  request(from, to, at = Date.now()) {
    if (from === to) return 'self';
    if (!this.q(`SELECT 1 FROM players WHERE pub = ?`, to).length) return 'unknown';
    if (this.q(`SELECT 1 FROM friends WHERE a = ? AND b = ?`, from, to).length) return 'friends';
    // They already asked us: opening their link counts as accepting.
    if (this.q(`SELECT 1 FROM requests WHERE from_pub = ? AND to_pub = ?`, to, from).length) {
      return this.accept(from, to) ? 'accepted' : 'full';
    }
    const pending = this.q(`SELECT COUNT(*) AS n FROM requests WHERE to_pub = ?`, to)[0].n;
    if (this.friendCount(from) >= MAX_FRIENDS || pending >= MAX_PENDING) return 'full';
    this.q(`INSERT OR IGNORE INTO requests (from_pub, to_pub, at) VALUES (?, ?, ?)`, from, to, at);
    return 'sent';
  }

  /** `me` accepts the request `from` sent. */
  accept(me, from) {
    if (!this.q(`SELECT 1 FROM requests WHERE from_pub = ? AND to_pub = ?`, from, me).length) return false;
    this.q(`DELETE FROM requests WHERE (from_pub = ? AND to_pub = ?) OR (from_pub = ? AND to_pub = ?)`, from, me, me, from);
    if (this.friendCount(me) >= MAX_FRIENDS || this.friendCount(from) >= MAX_FRIENDS) return false;
    this.q(`INSERT OR IGNORE INTO friends (a, b) VALUES (?, ?), (?, ?)`, me, from, from, me);
    return true;
  }

  reject(me, from) {
    this.q(`DELETE FROM requests WHERE from_pub = ? AND to_pub = ?`, from, me);
  }

  cancel(me, to) {
    this.q(`DELETE FROM requests WHERE from_pub = ? AND to_pub = ?`, me, to);
  }

  unfriend(me, other) {
    this.q(`DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)`, me, other, other, me);
  }

  // ------------------------------------------------------------ reads

  nameOf(pub) {
    return this.q(`SELECT name FROM players WHERE pub = ?`, pub)[0]?.name ?? '';
  }

  /** Everyone whose view changes when `pub` changes: themselves, friends and pending counterparts. */
  related(pub) {
    const rows = this.q(
      `SELECT b AS p FROM friends WHERE a = ?
       UNION SELECT to_pub FROM requests WHERE from_pub = ?
       UNION SELECT from_pub FROM requests WHERE to_pub = ?`,
      pub, pub, pub,
    );
    return [pub, ...rows.map(r => r.p)];
  }

  state(pub, day = gameDay()) {
    const rows = this.q(
      `SELECT p.pub, p.name, COALESCE(r.tries, 0) AS tries, COALESCE(r.solved, 0) AS solved,
              COALESCE(r.pad, 0) AS pad, r.solved_at AS solvedAt
       FROM players p LEFT JOIN results r ON r.pub = p.pub AND r.day = ?
       WHERE p.pub = ? OR p.pub IN (SELECT b FROM friends WHERE a = ?)`,
      day, pub, pub,
    )
      .map(r => ({ ...r, solved: Boolean(r.solved), pad: Boolean(r.pad) }))
      .sort(compareRows);
    const incoming = this.q(
      `SELECT p.pub, p.name FROM requests q JOIN players p ON p.pub = q.from_pub WHERE q.to_pub = ? ORDER BY q.at`,
      pub,
    );
    const outgoing = this.q(
      `SELECT p.pub, p.name FROM requests q JOIN players p ON p.pub = q.to_pub WHERE q.from_pub = ? ORDER BY q.at`,
      pub,
    );
    return { type: 'state', rows, incoming, outgoing, week: this.weekly.board(pub) };
  }

  // ------------------------------------------------------------ transport

  notify(pubs) {
    const wanted = new Set(pubs);
    const day = gameDay();
    for (const ws of this.ctx.getWebSockets()) {
      const { pub } = ws.deserializeAttachment() ?? {};
      if (!pub || !wanted.has(pub)) continue;
      try {
        ws.send(JSON.stringify(this.state(pub, day)));
      } catch {
        // Socket already closing; the runtime cleans it up.
      }
    }
  }

  async ensureCleanup() {
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + DAY_MS);
  }

  async alarm() {
    this.q(`DELETE FROM results WHERE day < ?`, shiftDay(gameDay(), -KEEP_DAYS));
    this.weekly.cleanup();
    await this.ctx.storage.setAlarm(Date.now() + DAY_MS);
  }

  /** Internal weekly API: { action: 'view' | 'guess', pub, name, week, guess }. */
  async weekRequest(req) {
    const { action, pub, name, week, guess } = await req.json();
    await this.ensureCleanup();
    // Just looking creates no player row; the first try does.
    if (action === 'view') return Response.json(await this.weekly.view(pub));
    this.touch(pub, name);
    const { status, body } = await this.weekly.guess(pub, week, guess);
    if (status === 200) this.notify(this.related(pub));
    return Response.json(body, { status });
  }

  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === '/week' && req.method === 'POST') return this.weekRequest(req);
    // Internal: a guess scored by the Worker.
    if (pathname === '/guess' && req.method === 'POST') {
      const event = await req.json();
      this.recordGuess(event);
      await this.ensureCleanup();
      this.notify(this.related(event.pub));
      return new Response(null, { status: 204 });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Client messages (all but hello need a prior hello on the socket):
  //   { type: 'hello', player, name, pad }  identify, set nickname, report notepad use
  //   { type: 'request', to } | { type: 'accept', from } | { type: 'reject', from }
  //   { type: 'cancel', to }  | { type: 'unfriend', pub } | { type: 'pad' }
  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === 'hello') {
      if (!isPlayer(msg.player)) return;
      const pub = await publicId(msg.player);
      ws.serializeAttachment({ pub });
      this.touch(pub, cleanName(msg.name));
      if (msg.pad === true) this.markPad(pub);
      this.notify(this.related(pub));
      return;
    }

    const { pub: me } = ws.deserializeAttachment() ?? {};
    if (!me) return;
    const other = msg.to ?? msg.from ?? msg.pub;
    if (msg.type === 'pad') {
      this.markPad(me);
      this.notify(this.related(me));
      return;
    }
    if (!isPub(other)) return;

    if (msg.type === 'request') {
      const result = this.request(me, other);
      ws.send(JSON.stringify({ type: 'ack', action: 'request', result, name: this.nameOf(other) }));
    } else if (msg.type === 'accept') {
      if (this.accept(me, other)) ws.send(JSON.stringify({ type: 'ack', action: 'accept', result: 'accepted', name: this.nameOf(other) }));
    } else if (msg.type === 'reject') {
      this.reject(me, other);
    } else if (msg.type === 'cancel') {
      this.cancel(me, other);
    } else if (msg.type === 'unfriend') {
      this.unfriend(me, other);
    } else {
      return;
    }
    this.notify([me, other]);
  }

  webSocketClose(ws, code) {
    try {
      ws.close(code, 'closing');
    } catch {
      // Already closed.
    }
  }
}
