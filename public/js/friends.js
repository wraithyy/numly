// Friends helpers shared by the browser and the Durable Object.

export const PLAYER_RE = /^[A-Za-z0-9-]{8,64}$/;
export const MAX_NAME = 20;
export const MAX_FRIENDS = 50;

export const isPlayer = p => typeof p === 'string' && PLAYER_RE.test(p);
export const isPub = p => typeof p === 'string' && /^[0-9a-f]{16}$/.test(p);

/** Collapse whitespace, drop control characters, cap the length. Returns '' when nothing usable is left. */
export function cleanName(name) {
  if (typeof name !== 'string') return '';
  return [...name.replace(/\s+/g, ' ').replace(/[\p{Cc}\p{Cf}]/gu, '').trim()].slice(0, MAX_NAME).join('');
}

/**
 * Public id of a player. The raw player id acts as a password for posting guesses, so only this hash
 * is stored, put into friend links and sent to friends; a client recognises itself by hashing its own id.
 */
export async function publicId(player) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`numly:${player}`));
  return [...new Uint8Array(digest)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Ranking order: solved first (fewest tries, then earliest), then players still trying (most tries first). */
export function compareRows(a, b) {
  if (a.solved !== b.solved) return a.solved ? -1 : 1;
  if (a.solved) return a.tries - b.tries || (a.solvedAt ?? 0) - (b.solvedAt ?? 0);
  return b.tries - a.tries || a.name.localeCompare(b.name);
}
