<script>
  import { LEN } from '../../../shared/logic.js';
  import { ui } from '../lib/app.svelte.js';
  import { game, score, setGuess } from './game.svelte.js';

  const best = $derived(Math.max(0, ...game.guesses.map(score).filter(s => s < LEN)));
  const rows = $derived(game.guesses.map((g, i) => ({ g, i, s: score(g) })).reverse());
</script>

<ol class="log">
  {#each rows as { g, i, s } (i)}
    <li class:new={game.newest && i === game.guesses.length - 1}>
      <button type="button" class="row {s === LEN ? 'win' : s === best && best > 0 ? 'best' : ''}" aria-label={ui.t('row', { g, s })} onclick={() => setGuess(g)}>
        <span class="n">#{String(i + 1).padStart(2, '0')}</span><span class="g">{g}</span>
        <span class="pins">{#each { length: LEN } as _, k (k)}<span class="pin" class:on={k < s}></span>{/each}</span>
        <span class="k">{s}/5</span>
      </button>
    </li>
  {/each}
</ol>
