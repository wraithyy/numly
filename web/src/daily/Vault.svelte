<script>
  import { LEN, msUntilNextDay } from '../../../shared/logic.js';
  import { mask, ui } from '../lib/app.svelte.js';
  import HideCode from '../HideCode.svelte';
  import Wheel from '../Wheel.svelte';
  import { game, refs, dayNo, archived, pad, won, stepDigit, fillFrom, submit } from './game.svelte.js';

  let { onStats } = $props();
  const t = $derived(ui.t);
  const CHEVRON = { up: 'M3 10l8-7 8 7', down: 'M3 2l8 7 8-7' };
  const SWIPE_STEP = 22; // pixels of vertical swipe per digit step, so a long swipe spins it

  // A digit that is certain shows as a faint hint in its cell (notepad on).
  const hints = $derived.by(() => {
    const p = pad();
    if (!p) return Array(LEN).fill('');
    return p.counts.map(slot => { const d = slot.indexOf(p.left); return d < 0 ? '' : String(d); });
  });

  function onInput(e, i) {
    // Typing replaces the cell; paste and SMS autofill spread across the following cells.
    const cell = e.currentTarget;
    const digits = (e.inputType === 'insertText' ? e.data || '' : cell.value).replace(/\D/g, '');
    if (digits) fillFrom(i, digits);
    else game.digits[i] = '';
    cell.value = game.digits[i];
  }

  function onKeydown(e, i) {
    const move = { ArrowLeft: i - 1, ArrowRight: i + 1 }[e.key];
    const roll = { ArrowUp: 1, ArrowDown: -1 }[e.key];
    if (roll) {
      e.preventDefault();
      stepDigit(i, roll);
    } else if (e.key === 'Backspace' && !game.digits[i] && i > 0) {
      e.preventDefault();
      game.digits[i - 1] = '';
      refs.cells[i - 1].focus();
    } else if (move >= 0 && move < LEN) {
      e.preventDefault();
      refs.cells[move].focus();
    }
  }

  // Swiping a cell up or down rolls its digit.
  let swipeY = null;
  const swipeStart = e => { if (e.pointerType !== 'mouse') swipeY = e.clientY; };
  function swipeMove(e, i) {
    if (swipeY === null) return;
    const dy = swipeY - e.clientY;
    if (Math.abs(dy) < SWIPE_STEP) return;
    stepDigit(i, dy > 0 ? 1 : -1);
    swipeY = e.clientY;
  }
  const swipeEnd = () => (swipeY = null);

  // Countdown to the next safe, only once this one is open.
  let countdown = $state('--:--:--');
  $effect(() => {
    if (!game.open) return;
    const tick = () => {
      const ms = msUntilNextDay();
      if (ms <= 1000) return location.reload();
      const s = Math.floor(ms / 1000);
      countdown = [s / 3600, (s / 60) % 60, s % 60].map(x => String(Math.floor(x)).padStart(2, '0')).join(':');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  });

  let shareLabel = $state(null);
  let shareFailed = $state(false);
  async function share() {
    const score = g => game.hits[g] ?? 0;
    const rows = game.guesses.map(g => '\u{1F7E8}'.repeat(score(g)) + '⬛'.repeat(LEN - score(g))).join('\n');
    const head = [`Numly #${Number(dayNo)}`, t('tries', { n: game.guesses.length }), game.padUsed && `\u{1F4DD} ${t('withPad')}`].filter(Boolean).join(' · ');
    const text = `${head}\n${rows}`;
    try {
      await navigator.clipboard.writeText(text);
      shareLabel = t('copied');
    } catch (err) {
      console.error('Clipboard write failed:', err);
      shareFailed = true;
      console.info(text);
    }
  }
</script>

<div class="vault" data-tier={game.tier} class:fresh={!game.instant} bind:this={refs.vault}>
  <div class="inside" aria-live="polite">
    {#if won()}
      <HideCode />
      <div>
        <p class="eyebrow">{t('opened')}</p>
        <p class="loot">{#each mask(game.guesses.at(-1)) as c, i (i)}<span style:--i={i}>{c}</span>{/each}</p>
        <p>{shareFailed ? t('copyFail') : `${t('tries', { n: game.guesses.length })} · ${t('safeNo', { d: dayNo })}`}</p>
        {#if game.rank?.beaten}<p class="rank-line">{t('rankBeaten', { p: game.rank.beaten, n: game.rank.peers })}</p>{/if}
        {#if game.padUsed}<p class="padbadge">{t('withPad')}</p>{/if}
        {#if !archived}<p class="next"><span>{t('next')}</span> <b>{countdown}</b></p>{/if}
        <div class="actions">
          <button class="btn gold" onclick={share}>{shareLabel ?? t('share')}</button>
          <button class="btn" onclick={onStats}>{t('stats')}</button>
        </div>
      </div>
    {/if}
  </div>
  <div class="leak"></div>
  <form class="door" id="door" class:open={game.open} class:instant={game.instant} bind:this={refs.door} onsubmit={e => { e.preventDefault(); submit(); }}>
    <div class="top">
      <span class="label">{t('label', { d: dayNo })}</span>
      <div class="leds" class:win={game.ledsWin} role="img" aria-label={t('leds')}>
        {#each { length: LEN } as _, i (i)}<span class="led" class:on={i < game.leds}></span>{/each}
      </div>
    </div>
    <div class="otp">
      {#each { length: LEN } as _, i (i)}
        <div class="slot">
          {@render nudge('up', i)}
          <input
            bind:this={refs.cells[i]}
            value={game.digits[i]}
            placeholder={hints[i]}
            disabled={game.open}
            inputmode="numeric"
            autocomplete={i ? 'off' : 'one-time-code'}
            enterkeyhint="go"
            aria-label={t('digit', { n: i + 1 })}
            onfocus={e => e.currentTarget.select()}
            oninput={e => onInput(e, i)}
            onkeydown={e => onKeydown(e, i)}
            onpointerdown={swipeStart}
            onpointermove={e => swipeMove(e, i)}
            onpointerup={swipeEnd}
            onpointercancel={swipeEnd}
          />
          {@render nudge('down', i)}
        </div>
      {/each}
    </div>
    <div class="base">
      <Wheel angle={game.wheel} misses={game.misses} disabled={game.open} label={t('wheel')} />
      <span class="hint">{t('turn')} · ENTER</span>
    </div>
    <i class="bolt"></i><i class="bolt"></i><i class="bolt"></i>
    <!-- the safe's serial number: a quiet nod to Sabi -->
    <span class="serial" aria-hidden="true">Nº SA81</span>
  </form>
  <div class="stamp" bind:this={refs.stamp}>{game.stamp}</div>
</div>

{#snippet nudge(dir, i)}
  <!-- tabindex -1: keyboard users have ArrowUp/Down; pointerdown keeps focus (and the phone keyboard) where it is -->
  <button
    type="button"
    class="nudge {dir}"
    tabindex="-1"
    aria-label={t(dir === 'up' ? 'incr' : 'decr', { n: i + 1 })}
    onpointerdown={e => e.preventDefault()}
    onclick={() => stepDigit(i, dir === 'up' ? 1 : -1)}
  >
    <svg viewBox="0 0 22 12"><path d={CHEVRON[dir]} /></svg>
  </button>
{/snippet}
