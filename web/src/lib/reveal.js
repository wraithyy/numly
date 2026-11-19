// The win sequence, shared by the daily and the weekly safe. The code spins in its cells like slot reels that
// stop one by one, the safe rumbles while light leaks round the door, the bolts give way, and only then does
// the caller open the door. Under prefers-reduced-motion it settles at once.
import { TIERS } from '../../../shared/logic.js';
import { vibrate } from './dom.js';
import { burst, TIER_COLORS } from './fx.js';

const CHARS = '0123456789ABCDEF';
const REEL_STEPS = 30; // characters each reel runs through before it stops
const wait = ms => new Promise(r => setTimeout(r, ms));
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A strip of characters laid over an (empty) input, ending on the code's character. */
function reelOver(input, char, base) {
  const h = input.offsetHeight;
  const reel = document.createElement('span');
  reel.className = 'reel';
  Object.assign(reel.style, { top: `${input.offsetTop}px`, left: `${input.offsetLeft}px`, width: `${input.offsetWidth}px`, height: `${h}px`, font: getComputedStyle(input).font, lineHeight: `${h}px` });
  const strip = document.createElement('span');
  const chars = [char, ...Array.from({ length: REEL_STEPS - 1 }, () => CHARS[Math.floor(Math.random() * base)]), char];
  strip.append(...chars.map(c => Object.assign(document.createElement('span'), { textContent: c })));
  reel.append(strip);
  input.parentElement.append(reel);
  return { reel, strip, distance: REEL_STEPS * h };
}

/** A jolt that dies away. */
export function jolt(el, amp, ms = 300) {
  if (reducedMotion()) return;
  const frames = Array.from({ length: 9 }, (_, i) => ({ transform: `translate(${(i % 2 ? -1 : 1) * amp * (1 - i / 8)}px, ${((i % 3) - 1) * amp * 0.4 * (1 - i / 8)}px)` }));
  el.animate(frames, { duration: ms });
}

/** Shaking that grows with the square of time: barely there at first, violent at the end. */
function rumble(el, sfx, ms, amp) {
  sfx.rumble(ms, amp);
  vibrate(Array.from({ length: Math.round(ms / 160) }, (_, i) => (i % 2 ? 60 : 20 + i * 6)));
  const n = Math.round(ms / 50);
  const frames = Array.from({ length: n }, (_, i) => {
    const k = (i / (n - 1)) ** 2 * amp;
    return { transform: `translate(${i % 2 ? -k : k}px, ${((i % 3) - 1) * k * 0.5}px) rotate(${(i % 2 ? -k : k) * 0.15}deg)` };
  });
  return el.animate(frames, { duration: ms }).finished;
}

/** Light leaking round the door, from wherever it is now to `to`. */
function leak(vault, to, ms) {
  const el = vault.querySelector('.leak');
  el?.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: to }], { duration: ms, fill: 'forwards', easing: 'ease-in' });
}

/**
 * Plays everything up to the moment the door may open.
 * `onLock(i)` fires as reel i stops (light its LED), `onLocked()` once all have.
 * `stuck` (the weekly safe): the first push fails and the safe goes quiet before the second.
 */
export async function winSequence({ vault, door, cells, code, base = 10, sfx, onLock, onLocked = () => {}, stuck = false }) {
  if (reducedMotion()) {
    cells.forEach((_, i) => onLock(i));
    onLocked();
    return;
  }
  const step = Math.min(340, 1700 / cells.length);
  let spinning = true;
  (function tick(gap) {
    if (!spinning) return;
    sfx.tick();
    setTimeout(() => tick(Math.min(gap * 1.05, 150)), gap);
  })(40);
  await Promise.all(cells.map((input, i) => {
    const { reel, strip, distance } = reelOver(input, code[i], base);
    reel.classList.add('spin');
    return strip.animate([{ transform: 'translateY(0)' }, { transform: `translateY(-${distance}px)` }],
      { duration: 900 + i * step, easing: 'cubic-bezier(.12,.75,.3,1.04)', fill: 'forwards' }).finished.then(() => {
      reel.classList.replace('spin', 'lock');
      onLock(i);
      sfx.lock(Math.min(i, 9));
      vibrate(18);
      jolt(vault, 1 + (i * 3.5) / cells.length, 170);
    });
  }));
  spinning = false;
  onLocked();
  await wait(650);

  if (stuck) {
    leak(vault, 0.35, 700);
    await rumble(door, sfx, 700, 3.5);
    leak(vault, 0.1, 300);
    await wait(480);
    leak(vault, 1, 1200);
    await rumble(door, sfx, 1200, 9);
  } else {
    leak(vault, 0.9, 1500);
    await rumble(door, sfx, 1500, 6);
  }
  await Promise.all([...door.querySelectorAll('.bolt')].map((b, i) => {
    sfx.bolt(i);
    return b.animate([{ transform: 'none' }, { transform: 'translateX(-16px)' }], { duration: 140, fill: 'forwards', easing: 'cubic-bezier(.5,0,1,.5)' }).finished;
  }));
  leak(vault, 0, 900);
}

/** The moment the swinging door hits its stop: a thud, coins, and a fanfare pitched higher for a richer tier. */
export function payoff({ vault, fx, tier, sfx }) {
  const rank = TIERS.indexOf(tier);
  sfx.slam();
  sfx.coins();
  sfx.fanfare(rank < 0 ? TIERS.length - 1 : rank);
  vibrate([40, 80, 40, 80, 200]);
  jolt(vault, 7, 420);
  const r = vault.getBoundingClientRect();
  burst(fx, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, TIER_COLORS[tier], 200);
}
