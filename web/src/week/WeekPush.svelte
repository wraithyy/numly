<script>
  import { onMount } from 'svelte';
  import { ui } from '../lib/app.svelte.js';
  import { push, initPush, togglePush } from '../lib/push.svelte.js';

  const t = $derived(ui.t);
  onMount(initPush);
</script>

{#if push.ready}
  <section class="weekpush">
    {#if push.denied && !push.on}
      <p class="note">{t('pushDenied')}</p>
    {:else}
      <button class="toggle" aria-pressed={push.on} disabled={push.busy} onclick={togglePush}><span class="sw"></span><span>{t('pushToggle')}</span></button>
    {/if}
  </section>
{/if}
