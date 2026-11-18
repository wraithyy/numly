// Small DOM helpers shared by components that drive CSS animations imperatively.

export const vibrate = pattern => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // unsupported
  }
};

/** Re-run a one-shot CSS animation class even if it is already applied. */
export function restartAnimation(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
