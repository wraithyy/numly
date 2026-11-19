<script>
  import Daily from './daily/Daily.svelte';
  import WeekPage from './week/WeekPage.svelte';
  import { ui } from './lib/app.svelte.js';

  $effect(() => {
    document.documentElement.lang = ui.lang;
  });
</script>

<!-- Two pages, plain links between them; the Worker serves index.html for /week. -->
{#if location.pathname === '/week'}
  <WeekPage />
{:else}
  <Daily />
{/if}

<footer class="credits">
  <a href="https://buymeacoffee.com/wraithyy" target="_blank" rel="noopener noreferrer">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3c0 1.5 1.5 1.5 1.5 3M12 3c0 1.5 1.5 1.5 1.5 3" /></svg>
    <span>{ui.t('coffee')}</span>
  </a>
</footer>
