<script>
  import { ui } from '../lib/app.svelte.js';
  import { store } from '../lib/storage.js';
  import { refs, won } from './game.svelte.js';

  let dialog;
  export const show = () => dialog.showModal();
  const t = $derived(ui.t);

  function onClose() {
    store('numly-seen', true);
    if (!won()) refs.cells[0]?.focus();
  }
</script>

<dialog id="help" bind:this={dialog} onclose={onClose}>
  <h2>{t('howTitle')}</h2>
  <ol class="steps">{@html t('steps')}</ol>
  <div class="example">
    <div><span>{t('exCode')}</span><code>40712</code></div>
    <div><span>{t('exTip')}</span><code>41111</code></div>
    <div><span>{t('exRes')}</span><i class="led on"></i><i class="led on"></i><i class="led"></i><i class="led"></i><i class="led"></i></div>
    <p>{@html t('exText')}</p>
  </div>
  <p class="note">{@html t('note')}</p>
  <p class="note"><span class="tierdots" aria-hidden="true"><i class="pink"></i><i class="gold"></i><i class="purple"></i><i class="blue"></i><i class="silver"></i></span> {t('tiers')}</p>
  <form method="dialog"><button class="btn gold wide">{t('go')}</button></form>
</dialog>
