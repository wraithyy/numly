import { LEN, consistentCodes, digitCounts, gameDay, msUntilNextDay, nextStats, streakNow } from './logic.js';
import { LANGS, I18N, detectLang, translator } from './i18n.js';
import { load, store } from './storage.js';
import { createSfx } from './audio.js';
import { burst } from './fx.js';
import { createFriends } from './friends-ui.js';

const byId = id => document.getElementById(id);
const vibrate = pattern => { try { navigator.vibrate?.(pattern); } catch { /* unsupported */ } };
const restartAnimation = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
const pad3 = n => String(n).padStart(3, '0');

// ---------------------------------------------------------------- state

const FIRST_DAY = '2026-11-18';
const today = gameDay(); // the server checks this against its own clock
const dayNo = pad3(Math.round((Date.parse(today) - Date.parse(FIRST_DAY)) / 864e5) + 1);

// The code itself lives only on the server; we keep each guess and the hit count it returned.
const GAME_KEY = `numly2-${today}`;
const PAD_USED_KEY = `numly-pad-used-${today}`;
const saved = load(GAME_KEY, { guesses: [], hits: {} });
const guesses = saved.guesses;
const hitsOf = saved.hits;

let stats = load('numly-stats', { won: 0, streak: 0, best: 0, last: null, hist: {} });
let muted = load('numly-mute', false);
let padOn = load('numly-pad', false);
let padUsed = load(PAD_USED_KEY, false);
let lang = LANGS.includes(load('numly-lang', '')) ? load('numly-lang', '') : detectLang(navigator.languages || [navigator.language]);
let t = translator(lang);
let busy = false;
let wheelAngle = 0;

const score = guess => hitsOf[guess] ?? 0;
const won = () => guesses.length > 0 && score(guesses.at(-1)) === LEN;
const saveGame = () => store(GAME_KEY, { guesses, hits: hitsOf });
const sfx = createSfx(() => muted);

// A random id per browser; the server only ever stores a hash of it.
const player = load('numly-player', '') || crypto.randomUUID();
store('numly-player', player);
const friends = createFriends({ t: () => t, player, onKey: () => sfx.key(), padUsed: () => padUsed });

/** Turning the notepad on before the safe is open marks today's result, even if it is switched off again. */
function markPadUsed() {
  if (!padOn || padUsed || won()) return;
  padUsed = true;
  store(PAD_USED_KEY, true);
  friends.markPad(); // friends see it right away, not only with the next guess
}

async function askSafe(guess) {
  const res = await fetch('/api/guess', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ day: today, guess, pad: padUsed, ...friends.guessInfo() }),
  });
  const body = await res.json();
  if (!res.ok || !Number.isInteger(body.hits)) {
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { wrongDay: res.status === 409 });
  }
  return body.hits;
}

// ---------------------------------------------------------------- code input (OTP cells)

const CHEVRON = { up: 'M3 10l8-7 8 7', down: 'M3 2l8 7 8-7' };

function nudgeButton(dir, index) {
  const btn = document.createElement('button');
  Object.assign(btn, { type: 'button', className: `nudge ${dir}`, tabIndex: -1 }); // keyboard users have ArrowUp/Down
  btn.dataset.dir = dir;
  btn.innerHTML = `<svg viewBox="0 0 22 12"><path d="${CHEVRON[dir]}"/></svg>`;
  btn.addEventListener('pointerdown', e => e.preventDefault()); // keep focus (and the mobile keyboard) where it is
  btn.addEventListener('click', () => stepDigit(index, dir === 'up' ? 1 : -1));
  return btn;
}

const cells = Array.from({ length: LEN }, (_, i) => {
  const cell = document.createElement('input');
  Object.assign(cell, { inputMode: 'numeric', autocomplete: i ? 'off' : 'one-time-code', enterKeyHint: 'go' });
  const slot = document.createElement('div');
  slot.className = 'slot';
  slot.append(nudgeButton('up', i), cell, nudgeButton('down', i));
  byId('otp').append(slot);
  return cell;
});

/** Roll a digit like a combination lock: up from empty starts at 0, down from empty at 9. */
function stepDigit(index, delta) {
  if (busy || won()) return;
  const cell = cells[index];
  const current = cell.value === '' ? (delta > 0 ? -1 : 10) : Number(cell.value);
  cell.value = String((current + delta + 10) % 10);
  restartAnimation(cell, delta > 0 ? 'roll-up' : 'roll-down');
  sfx.key();
  vibrate(5);
}

// Swiping a cell up or down rolls its digit; every SWIPE_STEP pixels is one step, so a long swipe spins it.
const SWIPE_STEP = 22;
cells.forEach((cell, i) => {
  let lastY = null;
  cell.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') lastY = e.clientY; });
  cell.addEventListener('pointermove', e => {
    if (lastY === null) return;
    const dy = lastY - e.clientY;
    if (Math.abs(dy) < SWIPE_STEP) return;
    stepDigit(i, dy > 0 ? 1 : -1);
    lastY = e.clientY;
  });
  const stop = () => { lastY = null; };
  cell.addEventListener('pointerup', stop);
  cell.addEventListener('pointercancel', stop);
});
const leds = Array.from({ length: LEN }, () => byId('leds').appendChild(Object.assign(document.createElement('span'), { className: 'led' })));
const setLeds = n => leds.forEach((led, i) => led.classList.toggle('on', i < n));

function fillFrom(index, digits) {
  let k = 0;
  for (; k < digits.length && index + k < LEN; k++) {
    cells[index + k].value = digits[k];
    restartAnimation(cells[index + k], 'tap');
  }
  cells[Math.min(index + k, LEN - 1)].focus();
  sfx.key();
}

function setGuess(guess) {
  [...guess].forEach((d, i) => { cells[i].value = d; restartAnimation(cells[i], 'tap'); });
  cells[LEN - 1].focus();
  sfx.key();
}

cells.forEach((cell, i) => {
  cell.addEventListener('focus', () => cell.select());
  cell.addEventListener('input', e => {
    // Typing replaces the cell; paste and SMS autofill spread across the following cells.
    const digits = (e.inputType === 'insertText' ? e.data || '' : cell.value).replace(/\D/g, '');
    if (digits) fillFrom(i, digits);
    else cell.value = '';
  });
  cell.addEventListener('keydown', e => {
    const move = { ArrowLeft: i - 1, ArrowRight: i + 1 }[e.key];
    const roll = { ArrowUp: 1, ArrowDown: -1 }[e.key];
    if (roll) {
      e.preventDefault();
      stepDigit(i, roll);
    } else if (e.key === 'Backspace' && !cell.value && i > 0) {
      e.preventDefault();
      cells[i - 1].value = '';
      cells[i - 1].focus();
    } else if (move >= 0 && move < LEN) {
      e.preventDefault();
      cells[move].focus();
    }
  });
});

// Allow playing from the keyboard without clicking a cell first.
document.addEventListener('keydown', e => {
  if (e.target !== document.body || won() || e.metaKey || e.ctrlKey || document.querySelector('dialog[open]')) return;
  const firstEmpty = cells.findIndex(c => !c.value);
  if (/^\d$/.test(e.key)) {
    e.preventDefault();
    fillFrom(firstEmpty < 0 ? LEN - 1 : firstEmpty, e.key);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    submit();
  }
});

// ---------------------------------------------------------------- a turn

function shake(message) {
  byId('msg').textContent = message;
  restartAnimation(byId('door'), 'shake');
  sfx.thud();
  vibrate([30, 40, 30]);
}

async function submit() {
  if (busy || won()) return;
  const guess = cells.map(c => c.value).join('');
  if (!/^\d{5}$/.test(guess)) {
    shake(t('missing'));
    (cells.find(c => !c.value) || cells[0]).focus();
    return;
  }

  busy = true;
  byId('msg').textContent = t('listen');
  let hits;
  try {
    hits = await askSafe(guess);
  } catch (err) {
    console.error('Guess request failed:', err);
    busy = false;
    shake(t(err.wrongDay ? 'wrongDay' : 'offline'));
    return;
  }

  const previousBest = Math.max(0, ...guesses.map(score));
  guesses.push(guess);
  hitsOf[guess] = hits;
  saveGame();

  wheelAngle += 360 + hits * 72;
  byId('wheel').style.transform = `rotate(${wheelAngle}deg)`;
  cells.forEach(c => (c.value = ''));
  setLeds(0);

  if (hits === 0) {
    setTimeout(() => { sfx.thud(); endTurn(t('zero')); }, 400);
    return;
  }
  // Light the tumblers one by one, each with its own click.
  for (let k = 0; k < hits; k++) {
    setTimeout(() => {
      leds[k].classList.add('on');
      sfx.click();
      vibrate(18);
      if (k === hits - 1) revealResult(hits, previousBest);
    }, 380 + k * 210);
  }
}

function revealResult(hits, previousBest) {
  if (hits === LEN) return win();
  const isRecord = hits > previousBest && guesses.length > 1;
  if (isRecord) {
    setTimeout(() => {
      byId('stamp').textContent = t('record', { n: hits });
      restartAnimation(byId('stamp'), 'show');
      sfx.chime();
      vibrate([20, 60, 20]);
    }, 250);
  }
  endTurn(t('hits', { n: hits }) + (isRecord ? ` ${t('recordMsg')}` : ''));
}

function endTurn(message) {
  const left = renderPad();
  restartAnimation(byId('left'), 'pulse');
  byId('msg').textContent = left === 1 ? `${message} ${t('oneLeft')}` : message;
  renderLog(true);
  busy = false;
  cells[0].focus();
}

function win() {
  stats = nextStats(stats, today, guesses.length);
  store('numly-stats', stats);
  renderHeader();
  renderLog(true);
  renderPad();
  byId('leds').classList.add('win');
  byId('msg').textContent = '';
  sfx.open();
  vibrate([40, 80, 40, 80, 200]);
  setTimeout(() => {
    openDoor(false);
    const r = byId('vault').getBoundingClientRect();
    burst(byId('fx'), { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    busy = false;
  }, 650);
}

// ---------------------------------------------------------------- open safe

let countdownStarted = false;

function openDoor(instant) {
  byId('loot').textContent = guesses.at(-1);
  renderLoot();
  byId('door').classList.toggle('instant', instant);
  byId('door').classList.add('open');
  cells.forEach(c => (c.disabled = true));
  byId('wheel').disabled = true;
  if (!countdownStarted) {
    countdownStarted = true;
    tickCountdown();
    setInterval(tickCountdown, 1000);
  }
}

function renderLoot() {
  if (!won()) return;
  byId('lootInfo').textContent = `${t('tries', { n: guesses.length })} · ${t('safeNo', { d: dayNo })}`;
  byId('padBadge').hidden = !padUsed;
  byId('padBadge').textContent = t('withPad');
}

function tickCountdown() {
  const ms = msUntilNextDay();
  if (ms <= 1000) return location.reload();
  const s = Math.floor(ms / 1000);
  byId('cd').textContent = [s / 3600, (s / 60) % 60, s % 60].map(x => String(Math.floor(x)).padStart(2, '0')).join(':');
}

byId('share').onclick = async () => {
  const rows = guesses.map(g => '\u{1F7E8}'.repeat(score(g)) + '⬛'.repeat(LEN - score(g))).join('\n');
  const head = [`Numly #${Number(dayNo)}`, t('tries', { n: guesses.length }), padUsed && `\u{1F4DD} ${t('withPad')}`].filter(Boolean).join(' · ');
  const text = `${head}\n${rows}`;
  try {
    await navigator.clipboard.writeText(text);
    byId('share').textContent = t('copied');
  } catch (err) {
    console.error('Clipboard write failed:', err);
    byId('lootInfo').textContent = t('copyFail');
    console.info(text);
  }
};

// ---------------------------------------------------------------- rendering

function applyStaticText() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach(el => { el.innerHTML = t(el.dataset.t); });
  document.querySelectorAll('[data-ta]').forEach(el => {
    for (const pair of el.dataset.ta.split(',')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr, t(key));
    }
  });
  cells.forEach((c, i) => c.setAttribute('aria-label', t('digit', { n: i + 1 })));
  document.querySelectorAll('.slot').forEach((slot, i) => {
    slot.querySelector('.up').setAttribute('aria-label', t('incr', { n: i + 1 }));
    slot.querySelector('.down').setAttribute('aria-label', t('decr', { n: i + 1 }));
  });
}

function renderHeader() {
  byId('meta').textContent = t('meta', { d: dayNo });
  byId('label').textContent = t('label', { d: dayNo });
  const streak = streakNow(stats, today);
  byId('streak').textContent = t('streak', { n: streak });
  byId('streak').classList.toggle('hot', streak > 0);
  const waves = muted ? '<path d="M16 9l5 6M21 9l-5 6"/>' : '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>';
  byId('muteBtn').innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/>${waves}</svg>`;
  byId('muteBtn').setAttribute('aria-pressed', String(!muted));
}

function renderLog(highlightNewest) {
  const best = Math.max(0, ...guesses.map(score).filter(s => s < LEN));
  byId('log').innerHTML = guesses
    .map((g, i) => {
      const s = score(g);
      const pins = Array.from({ length: LEN }, (_, k) => `<span class="pin${k < s ? ' on' : ''}"></span>`).join('');
      const kind = s === LEN ? 'win' : s === best && best > 0 ? 'best' : '';
      const isNew = highlightNewest && i === guesses.length - 1;
      return `<li class="${isNew ? 'new' : ''}">
        <button type="button" class="row ${kind}" data-g="${g}" aria-label="${t('row', { g, s })}">
          <span class="n">#${String(i + 1).padStart(2, '0')}</span><span class="g">${g}</span>
          <span class="pins">${pins}</span><span class="k">${s}/5</span>
        </button></li>`;
    })
    .reverse()
    .join('');
}

/** Renders the notepad and returns how many codes are still possible (null while it is off). */
function renderPad() {
  byId('padBtn').setAttribute('aria-pressed', String(padOn));
  byId('padBody').hidden = !padOn;
  byId('padWarn').textContent = padUsed ? t('padOn') : won() ? '' : t('padOff');
  if (!padOn) {
    byId('left').textContent = '';
    cells.forEach(c => (c.placeholder = ''));
    return null;
  }

  const left = consistentCodes(guesses.map(g => [g, score(g)]));
  const counts = digitCounts(left);
  byId('left').textContent = `${left.length.toLocaleString(lang)} ${t.codes(left.length)}`;

  // One column per slot (aligned under the code cells), one row per digit.
  byId('pad').innerHTML = Array.from({ length: 10 }, (_, d) =>
    counts
      .map((slot, p) => {
        const state = slot[d] === 0 ? 'no' : slot[d] === left.length ? 'sure' : '';
        const label = t('cell', { p: p + 1, d, st: t(state || 'maybe') });
        return `<button type="button" class="pc ${state}" data-p="${p}" data-d="${d}" ${won() ? 'disabled' : ''} aria-label="${label}">${d}</button>`;
      })
      .join(''),
  ).join('');

  // A digit that is certain shows as a faint hint in its cell.
  cells.forEach((c, p) => {
    const d = counts[p].indexOf(left.length);
    c.placeholder = d < 0 ? '' : String(d);
  });
  return left.length;
}

function showStats() {
  byId('sWon').textContent = stats.won;
  byId('sStreak').textContent = streakNow(stats, today);
  byId('sBest').textContent = stats.best;
  const buckets = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11+'];
  const max = Math.max(1, ...buckets.map(k => stats.hist[k] || 0));
  const todays = won() ? (guesses.length > 10 ? '11+' : String(guesses.length)) : null;
  byId('hist').innerHTML = buckets
    .map(k => {
      const v = stats.hist[k] || 0;
      return `<div class="bar${k === todays ? ' today' : ''}"><span>${k}</span><i style="width:${(v / max) * 100}%">${v}</i></div>`;
    })
    .join('');
  byId('stats').showModal();
}

function renderAll() {
  byId('lang').value = lang;
  applyStaticText();
  renderHeader();
  renderLog(false);
  renderPad();
  renderLoot();
  friends.render();
  byId('msg').textContent = '';
}

// ---------------------------------------------------------------- PWA: offline shell + install

if ('serviceWorker' in navigator) {
  // When a new version's worker takes over an already-controlled page, reload once so the page
  // is not left running the previous release's code.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('/sw.js').catch(err => console.error('Service worker registration failed:', err));
}

const syncOnline = () => { byId('offline').hidden = navigator.onLine; };
addEventListener('online', syncOnline);
addEventListener('offline', syncOnline);
syncOnline();

let installPrompt = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); // show our own button instead of the browser's mini-infobar
  installPrompt = e;
  byId('installBtn').hidden = false;
});
byId('installBtn').onclick = async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  byId('installBtn').hidden = true;
};
addEventListener('appinstalled', () => { byId('installBtn').hidden = true; });

// ---------------------------------------------------------------- controls

byId('door').onsubmit = e => { e.preventDefault(); submit(); };

byId('log').onclick = e => {
  const row = e.target.closest('.row');
  if (row && !won() && !busy) setGuess(row.dataset.g);
};

byId('pad').onclick = e => {
  const btn = e.target.closest('button');
  if (!btn || busy || won()) return;
  const p = Number(btn.dataset.p);
  cells[p].value = btn.dataset.d;
  restartAnimation(cells[p], 'tap');
  cells[Math.min(p + 1, LEN - 1)].focus();
  sfx.key();
  vibrate(8);
};

byId('padBtn').onclick = () => {
  padOn = !padOn;
  store('numly-pad', padOn);
  markPadUsed();
  renderPad();
  renderLoot();
  sfx.key();
};

byId('muteBtn').onclick = () => {
  muted = !muted;
  store('numly-mute', muted);
  renderHeader();
  sfx.key();
};

byId('statsBtn').onclick = byId('statsBtn2').onclick = showStats;
byId('helpBtn').onclick = () => byId('help').showModal();
byId('help').addEventListener('close', () => {
  store('numly-seen', true);
  if (!won()) cells[0].focus();
});

byId('lang').innerHTML = LANGS.map(l => `<option value="${l}">${l.toUpperCase()} · ${I18N[l].langName}</option>`).join('');
byId('lang').onchange = () => {
  lang = byId('lang').value;
  t = translator(lang);
  store('numly-lang', lang);
  renderAll();
};

// ---------------------------------------------------------------- boot

markPadUsed(); // a notepad left on from an earlier day counts as soon as today's game is open
renderAll();
if (won()) {
  setLeds(LEN);
  openDoor(true);
} else {
  setLeds(guesses.length ? score(guesses.at(-1)) : 0);
  cells[0].focus();
}
if (!load('numly-seen', false)) byId('help').showModal();
