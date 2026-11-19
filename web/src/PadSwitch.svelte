<script>
  // The notepad switch. Turning it on for the first time in a game is recorded in the result,
  // so that one switch-on asks first; switching off, or on again once recorded, does not.
  import { ui } from './lib/app.svelte.js';

  let { id = undefined, on, ask, label, text, toggle } = $props();
  let dialog;
  const t = $derived(ui.t);

  function click() {
    if (on || !ask) return toggle();
    dialog.returnValue = ''; // Escape keeps the previous value
    dialog.showModal();
  }
  const closed = () => dialog.returnValue === 'on' && toggle();
</script>

<button {id} class="toggle" aria-pressed={on} onclick={click}><span class="sw"></span><span>{label}</span></button>
<dialog bind:this={dialog} onclose={closed}>
  <h2>{t('padAskTitle')}</h2>
  <p>{text}</p>
  <form method="dialog" class="ask">
    <button class="btn" value="">{t('padAskNo')}</button>
    <button class="btn gold" value="on">{t('padAskYes')}</button>
  </form>
</dialog>
