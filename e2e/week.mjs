import { weekGame } from '../src/weekly.js';
import { gameWeek, padAllowed } from '../shared/week.js';
import { befriend, browser, check, sleep } from './lib.mjs';

const game = env => weekGame(env, gameWeek());
const wrongChar = (c, base) => '0123456789ABCDEF'[(parseInt(c, 16) + 1) % base];

/** Big safe with mastermind, played by Ann while her friend Bob watches the weekly board. */
export async function big({ base, env }) {
  const { spec, secret } = await game(env);
  const ann = await browser(base, 9311);
  const bob = await browser(base, 9312);
  try {
    await ann.reset('Ann');
    await bob.reset('Bob');
    await befriend(ann, bob, 'Ann');
    await ann.go('/');
    check('daily header links to the week with a dot', await ann.ev(`!!document.querySelector('#navBtn[href="/week"] .dot')`));

    await ann.go('/week');
    check('card shows the type and modifiers', (await ann.text('.weekcard h2')) === 'VELKÝ TREZOR' && (await ann.ev(`document.querySelectorAll('.mods li').length`)) === spec.mods.length);
    check('cells match the code length', (await ann.ev(`document.querySelectorAll('.otp input').length`)) === spec.len);
    check('daily ration shown', (await ann.text('.limits')).includes(`dnes zbývá ${spec.perDay}`));
    check('last week revealed', /\S/.test(await ann.text('.lastweek code')));

    await ann.type([...secret.code].reverse().join(''));
    const msg = await ann.text('#msg');
    check('feedback with hits and near', msg.includes(`z ${spec.len} na místě`) && msg.includes('jinde'), msg);
    check('ration counts down', (await ann.text('.limits')).includes(`dnes zbývá ${spec.perDay - 1}`));

    await ann.ev(`document.querySelector('.wnotes summary').click()`);
    if (padAllowed(spec)) {
      await ann.ev(`document.querySelector('.wnotes .padbar .toggle').click(); document.querySelector('.wnotes dialog .btn.gold').click()`);
      await sleep(1500);
      check('automatic notepad counts codes', /\d/.test(await ann.text('.wnotes .left')), await ann.text('.wnotes .left'));
    } else {
      check('no automatic notepad for a code this long', !(await ann.ev(`!!document.querySelector('.wnotes .padbar')`)));
    }

    await ann.type(secret.code, 3500);
    check('door opens with the code', (await ann.text('.loot')) === secret.code);
    check('share button', await ann.ev(`!!document.querySelector('.vault .actions button')`));
    await bob.go('/week');
    const board = await bob.ev(`[...document.querySelectorAll('.weekboard .rank')].map(r => r.textContent.replace(/\\s+/g, ' ').trim())`);
    check('friend sees Ann first', board?.[0]?.includes('Ann') && board[0].includes('otevřeno · 2') && board[0].includes('blok') === padAllowed(spec), JSON.stringify(board));
    await ann.go('/');
    check('dot gone once solved', !(await ann.ev(`!!document.querySelector('#navBtn .dot')`)));
    check('no page errors', !ann.errors.length && !bob.errors.length, [...ann.errors, ...bob.errors].join(' | '));
  } finally {
    ann.close();
    bob.close();
  }
}

export async function cipher({ base, env }) {
  const { spec, secret } = await game(env);
  const p = await browser(base, 9313);
  try {
    await p.reset('Sol');
    await p.go('/week');
    check('cipher card', (await p.text('.weekcard h2')) === 'ŠIFRA');
    check('all clues listed', (await p.ev(`document.querySelectorAll('.clues li').length`)) === spec.clues.length);
    check('one try a day, no automatic notepad', (await p.text('.limits')).includes('dnes zbývá 1') && !(await p.ev(`!!document.querySelector('.wnotes .padbar')`)));
    await p.ev(`document.querySelector('.clues .row').click()`);
    await sleep(100);
    check('clue click fills the safe', (await p.ev(`[...document.querySelectorAll('.otp input')].map(c => c.value).join('')`)) === spec.clues[0][0]);
    await p.type([...secret.code].map(c => wrongChar(c, 10)).join(''));
    check('out for today, not locked for the week', (await p.text('#msg')).length > 0 && (await p.text('.limits')).includes('dnes zbývá 0'));
    check('no page errors', !p.errors.length, p.errors.join(' | '));
  } finally {
    p.close();
  }
}

export async function grid({ base, env }) {
  const { secret } = await game(env);
  const p = await browser(base, 9314);
  try {
    await p.reset('Gil');
    await p.go('/week');
    check('grid card', (await p.text('.weekcard h2')) === 'STĚNA SCHRÁNEK');
    check('25 cells in a wall', (await p.ev(`document.querySelectorAll('.wall input').length`)) === 25);
    check('no notes for the grid', !(await p.ev(`!!document.querySelector('.wnotes')`)));
    const guess = secret.code.slice(0, 5) + [...secret.code.slice(5)].map(c => wrongChar(c, 10)).join('');
    await p.type(guess);
    check('row and column hits', (await p.ev(`[...document.querySelectorAll('.wall .hit')].map(e => e.textContent).join(',')`)) === '5,0,0,0,0,1,1,1,1,1');
    check('score counter', (await p.text('.gridscore')) === '5/25');
    await p.type(secret.code, 4500);
    check('wall opens', (await p.text('.loot')) === secret.code);
    check('no page errors', !p.errors.length, p.errors.join(' | '));
  } finally {
    p.close();
  }
}

/** Heist with the sum modifier: help, links, hand-kept notes, the automatic notepad, stats. */
export async function heist({ base, env }) {
  const { secret } = await game(env);
  const p = await browser(base, 9315, { width: 390, height: 844, mobile: true });
  try {
    await p.go('/', 800);
    await p.ev(`localStorage.clear(); localStorage.setItem('numly-seen','true'); localStorage.setItem('numly-lang','"cs"')`);
    await p.go('/week');
    check('weekly help opens on first visit', await p.ev(`document.getElementById('weekHelp').open`));
    await p.ev(`document.querySelector('#weekHelp form button').click()`);
    check('chain of five, A current', (await p.ev(`document.querySelectorAll('.chain li').length`)) === 5 && (await p.text('.chain li.now b')) === 'A');

    await p.ev(`document.querySelector('.wnotes summary').click()`);
    await p.ev(`document.querySelectorAll('.wnotes .pc')[0].click(); document.querySelectorAll('.wnotes .pc')[1].click(); document.querySelectorAll('.wnotes .pc')[1].click()`);
    check('hand notes: rule out, then certain', await p.ev(`document.querySelectorAll('.wnotes .pc')[0].classList.contains('no') && document.querySelectorAll('.wnotes .pc')[1].classList.contains('sure')`));
    await p.go('/week');
    await p.ev(`document.querySelector('.wnotes summary').click()`);
    check('hand notes survive a reload', (await p.ev(`document.querySelectorAll('.wnotes .pc.no, .wnotes .pc.sure').length`)) === 2);

    await p.type(secret.codes[0]);
    check('safe A opens, B is current', (await p.text('#msg')).includes('Trezor A otevřen') && (await p.text('.chain li.now b')) === 'B');
    const { at, from } = secret.links[0];
    check('link to B revealed', (await p.text('.links li')) === `${at + 1}. znak B = ${from + 1}. znak A`);
    check('fresh notes for safe B', (await p.ev(`document.querySelectorAll('.wnotes .pc.no, .wnotes .pc.sure').length`)) === 0);

    await p.ev(`document.querySelector('.wnotes .padbar .toggle').click(); document.querySelector('.wnotes dialog .btn.gold').click()`);
    await sleep(500);
    const left = Number((await p.text('.wnotes .left')).replace(/\D/g, ''));
    check('automatic notepad uses the link and the sum', left > 0 && left < 1000, String(left));
    check('notepad use is remembered for the week', await p.ev(`Object.keys(localStorage).some(k => k.startsWith('numly-week-pad-used-') && localStorage.getItem(k) === 'true')`));
    check('no overflow at 390px', (await p.ev('document.documentElement.scrollWidth')) === 390);

    for (const code of secret.codes.slice(1)) await p.type(code, 2400);
    await sleep(1500);
    check('all five safes open', (await p.ev(`document.querySelectorAll('.chain li.done').length`)) === 5 && (await p.ev(`document.getElementById('door').classList.contains('open')`)));
    await p.ev(`document.getElementById('statsBtn').click()`);
    await sleep(200);
    check('weekly stats count the week', (await p.text('#weekStats .tiles b')) === '1');
    await p.go('/week');
    check('not double counted on reload', (await p.ev(`JSON.parse(localStorage.getItem('numly-week-stats')).won`)) === 1);
    check('no page errors', !p.errors.length, p.errors.join(' | '));
  } finally {
    p.close();
  }
}

/**
 * Monday reminders: the toggle, and what the service worker shows for a push in the player's language.
 * Subscribing itself needs a real push service, so the push is delivered through DevTools instead.
 */
export async function reminders({ base }) {
  const p = await browser(base, 9316);
  const registrations = [];
  p.on('ServiceWorker.workerRegistrationUpdated', ({ registrations: r }) => registrations.push(...r));
  try {
    await p.send('Browser.grantPermissions', { origin: base, permissions: ['notifications'] });
    await p.reset();
    await p.go('/week', 2500);
    check('reminder toggle shown', await p.ev(`!!document.querySelector('.weekpush .toggle')`));
    await p.send('ServiceWorker.enable');
    await sleep(500);
    const reg = registrations.find(r => !r.isDeleted);
    check('service worker registered', Boolean(reg));
    await p.ev(`caches.open('numly-prefs').then(c => c.put('/lang', new Response('cs')))`);
    await p.send('ServiceWorker.deliverPushMessage', { origin: base, registrationId: reg.registrationId, data: '' });
    await sleep(1000);
    const shown = await p.ev(`navigator.serviceWorker.getRegistration().then(r => r.getNotifications()).then(n => n.map(x => x.title + ' | ' + x.body))`);
    check('push shows a Czech notification', shown?.[0] === 'Nový týdenní trezor | Je pondělí a čeká tě nový trezor.', JSON.stringify(shown));
    check('no page errors', !p.errors.length, p.errors.join(' | '));
  } finally {
    p.close();
  }
}
