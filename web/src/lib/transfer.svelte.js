// Moving this profile to another device (see shared/transfer.js). The snapshot is every numly* key in
// localStorage; claiming one replaces this device's profile after a backup and reloads.
import { isPlayer } from '../../../shared/friends.js';
import { normalizeCode } from '../../../shared/transfer.js';
import { load } from './storage.js';

const OWN = /^numly[\w.-]*$/;
// This device's profile from just before a transfer replaced it; each transfer keeps its own, never overwritten.
const BACKUP = /^numly-backup/;
const MAX_KEYS = 1000;

// A link `/#transfer=CODE` opens the dialog with the code filled in. A fragment never reaches the server or a Referer.
const linked = /^#transfer=([\w-]{1,16})$/.exec(location.hash)?.[1] ?? null;
if (linked) history.replaceState(null, '', location.pathname + location.search);
export const transfer = $state({ open: Boolean(linked), code: linked ?? '' });

function profileKeys() {
  try {
    return Object.keys(localStorage).filter(k => OWN.test(k) && !BACKUP.test(k));
  } catch {
    return [];
  }
}
const snapshot = () => JSON.stringify(Object.fromEntries(profileKeys().map(k => [k, localStorage.getItem(k)])));

async function call(body) {
  const res = await fetch('/api/transfer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) throw new Error('trBad');
  if (res.status === 429) throw new Error('trLimited');
  if (!res.ok) throw new Error('offline');
  return data;
}

/** Leaves this profile on the server; resolves to { code, expires }. */
export const createCode = player => call({ action: 'create', player, data: snapshot() });

/** Fetches the profile behind a code. Validated here: only numly* keys with string values. */
export async function claim(input) {
  const code = normalizeCode(input);
  if (!code) throw new Error('trBad');
  const { player, data } = await call({ action: 'claim', code });
  let parsed = null;
  try {
    parsed = JSON.parse(data);
  } catch {
    // handled below
  }
  const entries = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.entries(parsed) : [];
  if (!isPlayer(player) || !entries.length || entries.length > MAX_KEYS || !entries.every(([k, v]) => OWN.test(k) && !BACKUP.test(k) && typeof v === 'string')) {
    throw new Error('trBad');
  }
  const get = (k, fallback) => { try { return JSON.parse(parsed[k]) ?? fallback; } catch { return fallback; } };
  const wins = (get('numly-stats', {}).won || 0) + (get('numly-week-stats', {}).won || 0);
  return { player, entries, name: get('numly-name', ''), wins };
}

/** Safes opened on this device, daily and weekly: what a transfer would replace. */
export const localWins = () => (load('numly-stats', { won: 0 }).won || 0) + (load('numly-week-stats', { won: 0 }).won || 0);

export function applyProfile({ player, entries }) {
  const before = profileKeys().map(k => [k, localStorage.getItem(k)]);
  try {
    localStorage.setItem(`numly-backup-${Date.now()}`, JSON.stringify(Object.fromEntries(before)));
    for (const [k] of before) localStorage.removeItem(k);
    for (const [k, v] of entries) localStorage.setItem(k, v);
    localStorage.setItem('numly-player', JSON.stringify(player));
  } catch (err) {
    // Storage full or blocked: put this device's profile back exactly as it was.
    console.error('Profile transfer could not be saved:', err);
    try {
      for (const k of profileKeys()) localStorage.removeItem(k);
      for (const [k, v] of before) localStorage.setItem(k, v);
    } catch (restoreErr) {
      console.error('Restoring the profile failed:', restoreErr);
    }
    throw new Error('offline');
  }
  location.replace('/');
}
