// localStorage can be missing or throw (private mode, blocked site data); the game must still run.

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not persisting is acceptable; the current session keeps working.
  }
}
