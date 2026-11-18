<script>
  import { ui } from '../lib/app.svelte.js';
  import { store } from '../lib/storage.js';
  import { TYPES, MODS } from '../../../shared/week.js';

  let dialog;
  export const show = () => dialog.showModal();
  const t = $derived(ui.t);
</script>

<dialog id="weekHelp" bind:this={dialog} onclose={() => store('numly-week-seen', true)}>
  <h2>{t('weekHowTitle')}</h2>
  <ol class="steps">{@html t('weekSteps')}</ol>
  <div class="example">
    {#each TYPES as type (type)}<p><b>{t(`type_${type}`)}</b></p>{/each}
    <p>{MODS.map(m => t(`mod_${m}`)).join(' · ')}</p>
  </div>
  <form method="dialog"><button class="btn gold wide">{t('go')}</button></form>
</dialog>
