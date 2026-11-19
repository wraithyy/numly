<script>
  // Notes for the weekly code. By hand: tap cycles a cell (ruled out, certain, blank).
  // Optionally automatic, like the daily notepad, where the code space is small enough to search;
  // switching it on marks the week on the friends board.
  import { ui } from '../lib/app.svelte.js';
  import { load, store } from '../lib/storage.js';
  import { candidates, padAllowed } from '../../../shared/week.js';
  import { wk, fillFrom, togglePad } from './week.svelte.js';
  import PadSwitch from '../PadSwitch.svelte';

  const DIGITS = '0123456789ABCDEF';
  const NEXT = { '': 'no', no: 'sure', sure: '' };

  const t = $derived(ui.t);
  const spec = $derived(wk.view.spec);
  const heist = $derived(wk.view.heist);
  // A heist starts a clean sheet for every safe.
  const key = $derived(`numly-week-notes-${wk.view.week}${heist ? `-${heist.current}` : ''}`);
  let marks = $state({});
  $effect(() => {
    marks = load(key, {});
  });

  const allowed = $derived(padAllowed(spec));
  const auto = $derived.by(() => {
    if (!allowed || !wk.padOn || wk.view.solved) return null;
    if (!heist) return candidates(spec, wk.view.tries, { sum: spec.sum ?? null });
    // Only this safe's tries count; its link to the safe before is known once that one is open.
    const tries = wk.view.tries.filter(x => x.safe === heist.current);
    const link = heist.links[heist.current - 1];
    const before = wk.view.tries.find(x => x.opened && x.safe === heist.current - 1)?.guess;
    const fixed = link && before ? { at: link.at, char: before[link.from] } : null;
    return candidates(spec, tries, { sum: spec.sums?.[heist.current] ?? null, fixed });
  });

  const cellState = (i, d) => {
    if (!auto) return marks[`${i}:${d}`] ?? '';
    const n = auto.counts[i][d];
    return n === 0 ? 'no' : n === auto.left ? 'sure' : '';
  };
  function tap(i, d) {
    if (auto) return fillFrom(i, DIGITS[d]);
    const id = `${i}:${d}`;
    const { [id]: current = '', ...rest } = marks;
    marks = NEXT[current] ? { ...rest, [id]: NEXT[current] } : rest;
    store(key, marks);
  }
  function clear() {
    marks = {};
    store(key, marks);
  }
</script>

<details class="pad wnotes">
  <summary class="toggle">{t('notesTitle')}</summary>
  {#if allowed && !wk.view.solved}
    <div class="padbar">
      <PadSwitch on={wk.padOn} ask={!wk.padUsed} label={t('notesAuto')} text={t('notesAutoOff')} toggle={togglePad} />
      <span class="left">{auto ? `${auto.left.toLocaleString(ui.lang)} ${t.codes(auto.left)}` : ''}</span>
    </div>
    <p class="warn">{wk.padUsed ? t('notesAutoOn') : t('notesAutoOff')}</p>
  {/if}
  <p class="legend">{@html auto ? t('notesAutoHint') : t('notesHint')}</p>
  <div class="padgrid" style:grid-template-columns="repeat({spec.len}, 1fr)">
    {#each { length: spec.base } as _, d (d)}
      {#each { length: spec.len } as _, i (i)}
        {@const st = cellState(i, d)}
        <button type="button" class="pc {st}" disabled={wk.view.solved}
          aria-label={t('cell', { p: i + 1, d: DIGITS[d], st: t(st || 'maybe') })}
          onclick={() => tap(i, d)}>{DIGITS[d]}</button>
      {/each}
    {/each}
  </div>
  {#if !auto && Object.keys(marks).length && !wk.view.solved}
    <button type="button" class="btn wide" onclick={clear}>{t('notesClear')}</button>
  {/if}
</details>
