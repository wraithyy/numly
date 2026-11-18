import { DatabaseSync } from 'node:sqlite';

// Minimal stand-in for a Durable Object's ctx, backed by Node's built-in SQLite.
export function fakeCtx() {
  const db = new DatabaseSync(':memory:');
  return {
    storage: {
      alarm: null,
      async getAlarm() { return this.alarm; },
      async setAlarm(at) { this.alarm = at; },
      sql: {
        exec(query, ...params) {
          const stmt = db.prepare(query);
          // node:sqlite returns null-prototype rows; spread them into plain objects like workerd does.
          const rows = stmt.columns().length ? stmt.all(...params).map(r => ({ ...r })) : (stmt.run(...params), []);
          return { toArray: () => rows };
        },
      },
    },
    getWebSockets: () => [],
  };
}
