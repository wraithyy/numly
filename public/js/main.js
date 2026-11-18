import { LEN, consistentCodes, digitCounts, nextStats, streakNow } from './logic.js';
import { LANGS, I18N, detectLang, translator } from './i18n.js';
import { load, store } from './storage.js';
import { createSfx } from './audio.js';
import { burst } from './fx.js';

const $ = id => document.getElementById(id);
const vibrate = pattern => { try { navigator.vibrate?.(pattern); } catch { /* unsupported */ } };
const restartAnimation = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
const pad3 = n => String(n).padStart(3, '0');

// ---------------------------------------------------------------- state

const FIRST_DAY = '2026-11-18';
const today = new Date().toLocaleDateString('sv'); // YYYY-MM-DD in the player's timezone
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

/** Turning the notepad on before the safe is open marks today's result, even if it is switched off again. */
function markPadUsed() {
  if (!padOn || padUsed || won()) return;
  padUsed = true;
  store(PAD_USED_KEY, true);
}

async function askSafe(guess) {
  const res = await fetch('/api/guess', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ day: today, guess }),
  });
  const body = await res.json();
  if (!res.ok || !Number.isInteger(body.hits)) throw new Error(body.error || `HTTP ${res.status}`);
  return body.hits;
}

// ---------------------------------------------------------------- code input (OTP cells)

const cells = Array.from({ length: LEN }, (_, i) => {
  const cell = document.createElement('input');
  Object.assign(cell, { inputMode: 'numeric', autocomplete: i ? 'off' : 'one-time-code', enterKeyHint: 'go' });
  $('otp').append(cell);
  return cell;
});
const leds = Array.from({ length: LEN }, () => $('leds').appendChild(Object.assign(document.createElement('span'), { className: 'led' })));
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
    if (e.key === 'Backspace' && !cell.value && i > 0) {
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
  $('msg').textContent = message;
  restartAnimation($('door'), 'shake');
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
  $('msg').textContent = t('listen');
  let hits;
  try {
    hits = await askSafe(guess);
  } catch (err) {
    console.error('Guess request failed:', err);
    busy = false;
    shake(t('offline'));
    return;
  }

  const previousBest = Math.max(0, ...guesses.map(score));
  guesses.push(guess);
  hitsOf[guess] = hits;
  saveGame();

  wheelAngle += 360 + hits * 72;
  $('wheel').style.transform = `rotate(${wheelAngle}deg)`;
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
      $('stamp').textContent = t('record', { n: hits });
      restartAnimation($('stamp'), 'show');
      sfx.chime();
      vibrate([20, 60, 20]);
    }, 250);
  }
  endTurn(t('hits', { n: hits }) + (isRecord ? ` ${t('recordMsg')}` : ''));
}

function endTurn(message) {
  const left = renderPad();
  restartAnimation($('left'), 'pulse');
  $('msg').textContent = left === 1 ? `${message} ${t('oneLeft')}` : message;
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
  $('leds').classList.add('win');
  $('msg').textContent = '';
  sfx.open();
  vibrate([40, 80, 40, 80, 200]);
  setTimeout(() => {
    openDoor(false);
    const r = $('vault').getBoundingClientRect();
    burst($('fx'), { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    busy = false;
  }, 650);
}

// ---------------------------------------------------------------- open safe

let countdownStarted = false;

function openDoor(instant) {
  $('loot').textContent = guesses.at(-1);
  renderLoot();
  $('door').classList.toggle('instant', instant);
  $('door').classList.add('open');
  cells.forEach(c => (c.disabled = true));
  $('wheel').disabled = true;
  if (!countdownStarted) {
    countdownStarted = true;
    tickCountdown();
    setInterval(tickCountdown, 1000);
  }
}

function renderLoot() {
  if (!won()) return;
  $('lootInfo').textContent = [t('tries', { n: guesses.length }), t('safeNo', { d: dayNo }), padUsed && t('withPad')]
    .filter(Boolean)
    .join(' · ');
}

function tickCountdown() {
  const now = new Date();
  const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  if (ms <= 0) return location.reload();
  const s = Math.floor(ms / 1000);
  $('cd').textContent = [s / 3600, (s / 60) % 60, s % 60].map(x => String(Math.floor(x)).padStart(2, '0')).join(':');
}

$('share').onclick = async () => {
  const rows = guesses.map(g => '\u{1F7E8}'.repeat(score(g)) + '⬛'.repeat(LEN - score(g))).join('\n');
  const head = [`Numly #${Number(dayNo)}`, t('tries', { n: guesses.length }), padUsed && t('withPad')].filter(Boolean).join(' · ');
  const text = `${head}\n${rows}`;
  try {
    await navigator.clipboard.writeText(text);
    $('share').textContent = t('copied');
  } catch (err) {
    console.error('Clipboard write failed:', err);
    $('lootInfo').textContent = t('copyFail');
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
}

function renderHeader() {
  $('meta').textContent = t('meta', { d: dayNo });
  $('label').textContent = t('label', { d: dayNo });
  const streak = streakNow(stats, today);
  $('streak').textContent = t('streak', { n: streak });
  $('streak').classList.toggle('hot', streak > 0);
  const waves = muted ? '<path d="M16 9l5 6M21 9l-5 6"/>' : '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>';
  $('muteBtn').innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/>${waves}</svg>`;
  $('muteBtn').setAttribute('aria-pressed', String(!muted));
}

function renderLog(highlightNewest) {
  const best = Math.max(0, ...guesses.map(score).filter(s => s < LEN));
  $('log').innerHTML = guesses
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
  $('padBtn').setAttribute('aria-pressed', String(padOn));
  $('padBody').hidden = !padOn;
  $('padWarn').textContent = padUsed ? t('padOn') : won() ? '' : t('padOff');
  if (!padOn) {
    $('left').textContent = '';
    cells.forEach(c => (c.placeholder = ''));
    return null;
  }

  const left = consistentCodes(guesses.map(g => [g, score(g)]));
  const counts = digitCounts(left);
  $('left').textContent = `${left.length.toLocaleString(lang)} ${t.codes(left.length)}`;

  // One column per slot (aligned under the code cells), one row per digit.
  $('pad').innerHTML = Array.from({ length: 10 }, (_, d) =>
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
  $('sWon').textContent = stats.won;
  $('sStreak').textContent = streakNow(stats, today);
  $('sBest').textContent = stats.best;
  const buckets = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11+'];
  const max = Math.max(1, ...buckets.map(k => stats.hist[k] || 0));
  const todays = won() ? (guesses.length > 10 ? '11+' : String(guesses.length)) : null;
  $('hist').innerHTML = buckets
    .map(k => {
      const v = stats.hist[k] || 0;
      return `<div class="bar${k === todays ? ' today' : ''}"><span>${k}</span><i style="width:${(v / max) * 100}%">${v}</i></div>`;
    })
    .join('');
  $('stats').showModal();
}

function renderAll() {
  $('lang').value = lang;
  applyStaticText();
  renderHeader();
  renderLog(false);
  renderPad();
  renderLoot();
  $('msg').textContent = '';
}

// ---------------------------------------------------------------- controls

$('door').onsubmit = e => { e.preventDefault(); submit(); };

$('log').onclick = e => {
  const row = e.target.closest('.row');
  if (row && !won() && !busy) setGuess(row.dataset.g);
};

$('pad').onclick = e => {
  const btn = e.target.closest('button');
  if (!btn || busy || won()) return;
  const p = Number(btn.dataset.p);
  cells[p].value = btn.dataset.d;
  restartAnimation(cells[p], 'tap');
  cells[Math.min(p + 1, LEN - 1)].focus();
  sfx.key();
  vibrate(8);
};

$('padBtn').onclick = () => {
  padOn = !padOn;
  store('numly-pad', padOn);
  markPadUsed();
  renderPad();
  renderLoot();
  sfx.key();
};

$('muteBtn').onclick = () => {
  muted = !muted;
  store('numly-mute', muted);
  renderHeader();
  sfx.key();
};

$('statsBtn').onclick = $('statsBtn2').onclick = showStats;
$('helpBtn').onclick = () => $('help').showModal();
$('help').addEventListener('close', () => {
  store('numly-seen', true);
  if (!won()) cells[0].focus();
});

$('lang').innerHTML = LANGS.map(l => `<option value="${l}">${l.toUpperCase()} · ${I18N[l].langName}</option>`).join('');
$('lang').onchange = () => {
  lang = $('lang').value;
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
if (!load('numly-seen', false)) $('help').showModal();
