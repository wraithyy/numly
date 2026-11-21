<script>
  import { ui } from './lib/app.svelte.js';
</script>

<button type="button" class="hidecode" aria-pressed={ui.hideCode} aria-label={ui.t(ui.hideCode ? 'showCode' : 'hideCode')} title={ui.t(ui.hideCode ? 'showCode' : 'hideCode')} onclick={() => (ui.hideCode = !ui.hideCode)}>
  <svg viewBox="0 0 24 24">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
    {#if ui.hideCode}<path d="M4 4l16 16" />{/if}
  </svg>
</button>
