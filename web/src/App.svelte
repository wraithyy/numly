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
