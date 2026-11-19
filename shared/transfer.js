// Moving a profile to another device: the old device leaves a snapshot on the server under a short
// one-time code, the new one claims it. The code stands in for the player's id, so it is short-lived,
// single-use and guessing it is rate-limited.

// No 0/O, 1/I/L: the code is read off one screen and typed into another.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 8;
export const CODE_RE = new RegExp(`^[${ALPHABET}]{${LENGTH}}$`);
export const TRANSFER_MS = 10 * 60_000;
export const MAX_TRANSFER = 200_000; // characters of snapshot JSON; a full archive is far smaller
export const MAX_LIVE_TRANSFERS = 500; // snapshots waiting at once, across everyone
// Per address and minute; the global cap only backstops a guesser spread over many addresses.
export const LIMITS = { create: 5, fail: 20, failAll: 2000 };

export function newCode() {
  const out = [];
  while (out.length < LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(LENGTH))) {
      if (b < 248 && out.length < LENGTH) out.push(ALPHABET[b % ALPHABET.length]); // 248 = 8 * 31, no modulo bias
    }
  }
  return out.join('');
}

export const formatCode = code => `${code.slice(0, 4)}-${code.slice(4)}`;

/** Accepts lower case, spaces and the dash; returns null for anything that cannot be a code. */
export function normalizeCode(input) {
  const code = String(input ?? '').toUpperCase().replace(/[\s-]/g, '');
  return CODE_RE.test(code) ? code : null;
}
