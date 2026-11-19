<script>
  import { ui } from '../lib/app.svelte.js';
  import Wheel from '../Wheel.svelte';
  import { wk, refs, stepChar, fillFrom, submit, isChar, msUntilNextWeek, safeLetter } from './week.svelte.js';

  let { weekNo } = $props();
  const t = $derived(ui.t);
  const spec = $derived(wk.view.spec);
  const grid = $derived(Boolean(spec.size));
  const last = $derived(wk.view.tries.at(-1));
  const label = $derived(spec.type === 'heist' && !wk.view.solved ? t('label', { d: safeLetter(wk.view.heist.current) }) : t('weekLabel', { w: weekNo }));
  const loot = $derived(wk.view.solved ? (grid ? last.guess.match(/.{5}/g) : [last.guess]) : []);
  const CHEVRON = { up: 'M3 10l8-7 8 7', down: 'M3 2l8 7 8-7' };
  const SWIPE_STEP = 22;

  function onInput(e, i) {
    // Typing replaces the cell; paste spreads across the following cells.
    const cell = e.currentTarget;
    const chars = [...(e.inputType === 'insertText' ? e.data || '' : cell.value)].filter(isChar).join('');
    if (chars) fillFrom(i, chars);
    else wk.digits[i] = '';
    cell.value = wk.digits[i];
  }

  function onKeydown(e, i) {
    const move = { ArrowLeft: i - 1, ArrowRight: i + 1 }[e.key];
    const roll = { ArrowUp: 1, ArrowDown: -1 }[e.key];
    if (roll) {
      e.preventDefault();
      stepChar(i, roll);
    } else if (e.key === 'Backspace' && !wk.digits[i] && i > 0) {
      e.preventDefault();
      wk.digits[i - 1] = '';
      refs.cells[i - 1].focus();
    } else if (move >= 0 && move < spec.len) {
      e.preventDefault();
      refs.cells[move].focus();
    }
  }

  let swipeY = null;
  const swipeStart = e => { if (e.pointerType !== 'mouse') swipeY = e.clientY; };
  function swipeMove(e, i) {
    if (swipeY === null) return;
    const dy = swipeY - e.clientY;
    if (Math.abs(dy) < SWIPE_STEP) return;
    stepChar(i, dy > 0 ? 1 : -1);
    swipeY = e.clientY;
  }
  const swipeEnd = () => (swipeY = null);

  // One sparkline character per try (hits out of the code length), so a long week still fits a message.
  const BARS = '▁▂▃▄▅▆▇█';
  let shareLabel = $state(null);
  let shareFailed = $state(false);
  async function share() {
    const tries = wk.view.tries;
    const line = tries.slice(-40).map(x => BARS[Math.round((x.hits / spec.len) * (BARS.length - 1))]).join('');
    const rules = [t(`type_${spec.type}`), ...spec.mods.map(m => t(`mod_${m}`))].join(' · ');
    const head = [`Numly · ${t('weekMeta', { w: weekNo })}`, t('tries', { n: tries.length }), wk.padUsed && `\u{1F4DD} ${t('withPad')}`].filter(Boolean).join(' · ');
    const text = `${head}\n${rules}\n${line}`;
    try {
      await navigator.clipboard.writeText(text);
      shareLabel = t('copied');
    } catch (err) {
      console.error('Clipboard write failed:', err);
      shareFailed = true;
    }
  }

  let countdown = $state('');
  $effect(() => {
    if (!wk.open) return;
    const tick = () => {
      const ms = msUntilNextWeek();
      if (ms <= 1000) return location.reload();
      const s = Math.floor(ms / 1000);
      const days = Math.floor(s / 86400);
      const hms = [(s % 86400) / 3600, (s / 60) % 60, s % 60].map(x => String(Math.floor(x)).padStart(2, '0')).join(':');
      countdown = days ? `${days}${t('weekDays')} ${hms}` : hms;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  });
</script>

<div class="vault" data-tier={wk.tier} class:fresh={!wk.instant} bind:this={refs.vault}>
  <div class="inside" aria-live="polite">
    {#if wk.view.solved}
      <div>
        <p class="eyebrow">{t('opened')}</p>
        <p class="loot long" class:wall={grid}>{#each loot as line, i (i)}<span style:--i={i}>{line}</span>{/each}</p>
        <p>{shareFailed ? t('copyFail') : t('weekSolved', { n: wk.view.tries.length })}</p>
        {#if wk.padUsed}<p class="padbadge">{t('withPad')}</p>{/if}
        <p class="next"><span>{t('weekEnds')}</span> <b>{countdown}</b></p>
        <div class="actions"><button class="btn gold" onclick={share}>{shareLabel ?? t('share')}</button></div>
      </div>
    {/if}
  </div>
  <div class="leak"></div>
  <form class="door" id="door" class:open={wk.open} class:instant={wk.instant} bind:this={refs.door} onsubmit={e => { e.preventDefault(); submit(); }}>
    <div class="top">
      <span class="label">{label}</span>
      {#if grid}
        <span class="gridscore" class:on={wk.leds > 0}>{wk.leds}/{spec.len}</span>
      {:else}
        <div class="leds" class:win={wk.ledsWin} role="img" aria-label={t('leds')}>
          {#each { length: spec.len } as _, i (i)}<span class="led small" class:on={i < wk.leds}></span>{/each}
        </div>
      {/if}
    </div>
    {#if wk.near !== null}<p class="near">{t('weekNear', { n: wk.near })}</p>{/if}
    {#if grid}
      <!-- the last try's hits per row (right) and per column (bottom) -->
      <div class="wall" style:grid-template-columns="repeat({spec.size}, minmax(0, 1fr)) 1.6em">
        {#each { length: spec.size } as _, r (r)}
          {#each { length: spec.size } as _, c (c)}{@render cell(r * spec.size + c)}{/each}
          <span class="hit">{last?.rows?.[r] ?? '·'}</span>
        {/each}
        {#each { length: spec.size } as _, c (c)}<span class="hit">{last?.cols?.[c] ?? '·'}</span>{/each}
      </div>
    {:else}
      <div class="otp long" style:grid-template-columns="repeat({spec.len}, minmax(0, 1fr))">
        {#each { length: spec.len } as _, i (i)}
          <div class="slot">
            {@render nudge('up', i)}
            {@render cell(i)}
            {@render nudge('down', i)}
          </div>
        {/each}
      </div>
    {/if}
    <div class="base">
      <Wheel angle={wk.wheel} misses={wk.misses} disabled={wk.view.solved} label={t('wheel')} />
      <span class="hint">{t('turn')} · ENTER</span>
    </div>
    <i class="bolt"></i><i class="bolt"></i><i class="bolt"></i>
  </form>
</div>

{#snippet cell(i)}
  <input
    bind:this={refs.cells[i]}
    value={wk.digits[i]}
    disabled={wk.view.solved}
    inputmode={spec.base === 16 ? 'text' : 'numeric'}
    autocapitalize="characters"
    autocomplete="off"
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
{/snippet}

{#snippet nudge(dir, i)}
  <button
    type="button"
    class="nudge {dir}"
    tabindex="-1"
    aria-label={t(dir === 'up' ? 'incr' : 'decr', { n: i + 1 })}
    onpointerdown={e => e.preventDefault()}
    onclick={() => stepChar(i, dir === 'up' ? 1 : -1)}
  >
    <svg viewBox="0 0 22 12"><path d={CHEVRON[dir]} /></svg>
  </button>
{/snippet}
