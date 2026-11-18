<script>
  // Hand-kept notes: a weekly code is too long to hold in your head, and too big to solve for the
  // player like the daily notepad does. Tap cycles a cell: ruled out, certain, blank.
  import { ui } from '../lib/app.svelte.js';
  import { load, store } from '../lib/storage.js';
  import { wk } from './week.svelte.js';

  const DIGITS = '0123456789ABCDEF';
  const NEXT = { '': 'no', no: 'sure', sure: '' };

  const t = $derived(ui.t);
  const spec = $derived(wk.view.spec);
  // A heist starts a clean sheet for every safe.
  const key = $derived(`numly-week-notes-${wk.view.week}${wk.view.heist ? `-${wk.view.heist.current}` : ''}`);
  let marks = $state({});
  $effect(() => {
    marks = load(key, {});
  });

  function cycle(i, d) {
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
  <p class="legend">{@html t('notesHint')}</p>
  <div class="padgrid" style:grid-template-columns="repeat({spec.len}, 1fr)">
    {#each { length: spec.base } as _, d (d)}
      {#each { length: spec.len } as _, i (i)}
        {@const st = marks[`${i}:${d}`] ?? ''}
        <button type="button" class="pc {st}" disabled={wk.view.solved}
          aria-label={t('cell', { p: i + 1, d: DIGITS[d], st: t(st || 'maybe') })}
          onclick={() => cycle(i, d)}>{DIGITS[d]}</button>
      {/each}
    {/each}
  </div>
  {#if Object.keys(marks).length && !wk.view.solved}
    <button type="button" class="btn wide" onclick={clear}>{t('notesClear')}</button>
  {/if}
</details>
