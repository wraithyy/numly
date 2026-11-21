// App-wide state: language, sound, the player's id. Shared by the daily and weekly pages.
import { LANGS, detectLang, translator } from './i18n.js';
import { load, store } from './storage.js';
import { createSfx } from './audio.js';

const savedLang = load('numly-lang', '');
const lang = LANGS.includes(savedLang) ? savedLang : detectLang(navigator.languages || [navigator.language]);

export const ui = $state({ lang, t: translator(lang), muted: load('numly-mute', false), online: navigator.onLine, hideCode: false });

export function setLang(next) {
  ui.lang = next;
  ui.t = translator(next);
  store('numly-lang', next);
}

export function toggleMute() {
  ui.muted = !ui.muted;
  store('numly-mute', ui.muted);
}

/** Dots instead of the code's digits, so an open safe can be screenshotted and shown without spoiling it. */
export const mask = code => (ui.hideCode ? code.replace(/./g, '\u2022') : code);

export const sfx = createSfx(() => ui.muted);

// A random id per browser; the server only ever stores a hash of it.
export const player = load('numly-player', '') || crypto.randomUUID();
store('numly-player', player);

addEventListener('online', () => (ui.online = true));
addEventListener('offline', () => (ui.online = false));
