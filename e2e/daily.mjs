import { codeFor } from '../src/worker.js';
import { gameDay, shiftDay } from '../shared/logic.js';
import { browser, check, sleep } from './lib.mjs';

const cells = `[...document.querySelectorAll('.otp input')].map(c => c.value).join('')`;

export async function daily({ base, env }) {
  const day = gameDay();
  const code = await codeFor(day, env.SECRET);
  const wrong = [...code].map((d, i) => (i < 2 ? d : String((+d + 1) % 10))).join(''); // 2 hits
  const p = await browser(base, 9301);
  try {
    await p.go('/', 800);
    await p.ev(`localStorage.clear(); localStorage.setItem('numly-lang','"cs"')`);
    await p.go('/');
    check('help opens on first visit', await p.ev(`document.getElementById('help').open`));
    await p.ev(`document.querySelector('#help form button').click()`);
    check('header', (await p.text('.meta')).startsWith('Denní trezor'));

    await p.ev(`document.querySelector('.otp input').focus()`);
    for (const d of '12') await p.send('Input.insertText', { text: d });
    await p.ev(`document.getElementById('door').requestSubmit()`);
    await sleep(300);
    check('missing digits', (await p.text('#msg')).includes('Chybí'));
    await p.ev(`[...document.querySelectorAll('.otp input')].forEach(c => { c.value = ''; c.dispatchEvent(new InputEvent('input', { bubbles: true })); })`);

    await p.type(wrong);
    check('2 hits reported', (await p.text('#msg')).includes('2 z 5'));
    check('2 leds on', (await p.ev(`document.querySelectorAll('.leds .led.on').length`)) === 2);
    check('log row', (await p.text('.log .row .g')) === wrong);

    await p.ev(`document.getElementById('padBtn').click()`);
    await sleep(300);
    check('notepad grid', (await p.ev(`document.querySelectorAll('#pad .pc').length`)) === 50);
    check('notepad marks the day', await p.ev(`localStorage.getItem('numly-pad-used-${day}') === 'true'`));
    await p.ev(`document.querySelector('.log .row').click()`);
    check('history row refills the safe', (await p.ev(cells)) === wrong);
    await p.ev(`[...document.querySelectorAll('.otp input')].forEach(c => { c.value = ''; c.dispatchEvent(new InputEvent('input', { bubbles: true })); })`);

    // Three other players open today's safe in six tries each, so two tries beat all of them.
    for (const n of [1, 2, 3]) {
      const player = String(n).repeat(43);
      for (const g of [...Array(5).fill(wrong), code]) {
        await fetch(base + '/api/guess', { method: 'POST', body: JSON.stringify({ day, guess: g, player }) });
      }
    }
    await p.type(code, 3500);
    check('door opens with the code', (await p.text('.loot')) === code);
    check('rank among today\'s solvers', (await p.text('.rank-line'))?.includes('100 % z 3 hráčů'), await p.text('.rank-line'));
    check('notepad badge', await p.ev(`!!document.querySelector('.padbadge')`));
    check('countdown', /\d\d:\d\d:\d\d/.test(await p.text('.next b')));

    await p.go('/');
    check('reload keeps the open door and the rank', await p.ev(`document.getElementById('door').classList.contains('instant') && !!document.querySelector('.rank-line')`));
    check('streak', (await p.ev(`[...document.querySelectorAll('.plate')].map(x => x.textContent).join('|')`)).includes('SÉRIE 1'));
    await p.ev(`document.getElementById('statsBtn').click()`);
    await sleep(200);
    check('stats', (await p.text('#stats .tiles b')) === '1' && (await p.text('#stats .bar.today span')) === '2');
    await p.ev(`document.getElementById('stats').close()`);
    await p.ev(`(() => { const s = document.getElementById('lang'); s.value = 'en'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(100);
    check('language switch', (await p.text('.meta')).startsWith('Daily safe'));
    check('no page errors', !p.errors.length, p.errors.join(' | '));
  } finally {
    p.close();
  }
}

/** The archive list and an archive day, seen by a browser whose clock runs three days ahead. */
export async function archive({ base }) {
  const ahead = shiftDay(gameDay(), 3);
  const clock = `{const D = Date, off = D.parse('${ahead}T10:00:00Z') - D.now(); globalThis.Date = class extends D { constructor(...a) { super(...(a.length ? a : [D.now() + off])); } static now() { return D.now() + off; } };}`;
  const p = await browser(base, 9302, { width: 390, height: 844, mobile: true, init: clock });
  const solvedDay = shiftDay(ahead, -2);
  try {
    await p.reset();
    await p.ev(`localStorage.setItem('numly2-${solvedDay}', JSON.stringify({ guesses: ['11111', '13579'], hits: { 11111: 1, 13579: 5 } }))`);
    await p.go('/');
    await p.ev(`document.getElementById('statsBtn').click()`);
    await sleep(300);
    const rows = await p.ev(`[...document.querySelectorAll('.archive li')].map(l => l.textContent.replace(/\\s+/g, ' ').trim())`);
    check('archive lists past days, newest first', rows.length >= 3 && rows[1].includes('otevřeno · 2'), JSON.stringify(rows.slice(0, 3)));
    await p.ev(`document.querySelector('.archive li:nth-child(2) a').click()`);
    await sleep(1800);
    check('archive day opens', (await p.ev('location.search')) === `?day=${solvedDay}` && (await p.text('.meta')).startsWith('Archiv'));
    check('archive door open, no countdown', await p.ev(`document.getElementById('door').classList.contains('open') && !document.querySelector('.next')`));
    check('back link to today', (await p.ev(`document.querySelector('#navBtn').getAttribute('href')`)) === '/');
    check('no overflow at 390px', (await p.ev('document.documentElement.scrollWidth')) === 390);
    check('no page errors', !p.errors.length, p.errors.join(' | '));
  } finally {
    p.close();
  }
}

export async function friends({ base }) {
  const ann = await browser(base, 9303);
  const bob = await browser(base, 9304);
  const rows = b => b.ev(`[...document.querySelectorAll('#friendRanks li.rank')].map(li => li.textContent.replace(/\\s+/g, ' ').trim())`);
  try {
    await ann.reset('Ann');
    await bob.reset();
    await bob.go(`/?f=${await ann.pubOf()}&n=Ann`);
    check('a link without a nickname asks for one', await bob.ev(`document.getElementById('friends').open && document.getElementById('nameForm').getClientRects().length > 0`));
    await bob.ev(`const n = document.getElementById('nameInput'); n.value = 'Bob'; n.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('nameForm').requestSubmit()`);
    await sleep(1500);
    check('request sent', (await bob.ev(`[...document.querySelectorAll('#outgoing li .who')].map(e => e.textContent).join()`)).includes('Ann'));
    check('Ann gets a badge', (await ann.text('#friendsBadge')) === '1');
    await ann.ev(`document.getElementById('friendsBtn').click()`);
    await sleep(300);
    await ann.ev(`[...document.querySelectorAll('#incoming .btn')].find(b => b.textContent === 'Přijmout').click()`);
    await sleep(1200);
    check('friends on both sides', (await rows(ann)).some(r => r.includes('Bob')) && (await rows(bob)).some(r => r.includes('Ann')));

    await bob.ev(`document.getElementById('friends').close(); document.getElementById('padBtn').click()`);
    await bob.type('12345', 3000);
    check('Ann sees Bob play live, with the notepad tag', (await rows(ann)).some(r => r.includes('Bob') && r.includes('blok')), JSON.stringify(await rows(ann)));
    await ann.ev(`[...document.querySelectorAll('#friendRanks .x')].find(x => !x.hidden).click()`);
    await sleep(1200);
    check('unfriend removes both sides', !(await rows(bob)).some(r => r.includes('Ann')));
    check('no page errors', !ann.errors.length && !bob.errors.length, [...ann.errors, ...bob.errors].join(' | '));
  } finally {
    ann.close();
    bob.close();
  }
}
