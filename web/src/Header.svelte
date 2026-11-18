<script>
  import { LANGS, I18N } from './lib/i18n.js';
  import { ui, setLang, toggleMute, sfx } from './lib/app.svelte.js';
  import { friends } from './lib/friends.svelte.js';

  /** meta: subtitle under the logo; streak: current streak or null to hide it. */
  /** nav: { href, label, dot } link to the other game; onHelp/onStats are optional. */
  let { meta, streak = null, nav, onFriends, onHelp, onStats } = $props();

  let installPrompt = $state(null);
  $effect(() => {
    const onPrompt = e => {
      e.preventDefault(); // show our own button instead of the browser's mini-infobar
      installPrompt = e;
    };
    const onInstalled = () => (installPrompt = null);
    addEventListener('beforeinstallprompt', onPrompt);
    addEventListener('appinstalled', onInstalled);
    return () => {
      removeEventListener('beforeinstallprompt', onPrompt);
      removeEventListener('appinstalled', onInstalled);
    };
  });

  async function install() {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
  }

  const t = $derived(ui.t);
</script>

<p class="offline" role="status" hidden={ui.online}>{t('offlineBanner')}</p>
<header>
  <div>
    <h1>NUMLY</h1>
    <p class="meta">{meta}</p>
  </div>
  <div class="tools">
    {#if installPrompt}
      <button class="plate hot" onclick={install}>{t('install')}</button>
    {/if}
    {#if streak !== null}
      <span class="plate" class:hot={streak > 0} title={t('streakTitle')}>{t('streak', { n: streak })}</span>
    {/if}
    <button class="icon" id="friendsBtn" aria-label={t('friendsTitle')} title={t('friendsTitle')} onclick={onFriends}>
      <svg viewBox="0 0 24 24"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a7 7 0 0 1 14 0v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a7 7 0 0 0-4-6.3" /></svg>
      {#if friends.incoming.length}<span class="badge" id="friendsBadge">{friends.incoming.length}</span>{/if}
    </button>
    <a class="icon" id="navBtn" href={nav.href} aria-label={nav.label} title={nav.label}>
      {#if nav.href === '/week'}
        <svg viewBox="0 0 24 24"><path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5" /></svg>
      {:else}
        <svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM17 8v.01" /></svg>
      {/if}
      {#if nav.dot}<span class="dot"></span>{/if}
    </a>
    {#if onHelp}
    <button class="icon" id="helpBtn" aria-label={t('help')} title={t('help')} onclick={onHelp}>
      <svg viewBox="0 0 24 24"><path d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.4-1.5 1.2-1.5 2.2v.6M12 18h.01" /></svg>
    </button>
    {/if}
    {#if onStats}
    <button class="icon" id="statsBtn" aria-label={t('stats')} title={t('stats')} onclick={onStats}>
      <svg viewBox="0 0 24 24"><path d="M5 20V11M12 20V4M19 20v-6" /></svg>
    </button>
    {/if}
    <button class="icon" id="muteBtn" aria-label={t('sound')} title={t('sound')} aria-pressed={!ui.muted} onclick={() => { toggleMute(); sfx.key(); }}>
      <svg viewBox="0 0 24 24">
        <path d="M4 9h4l5-4v14l-5-4H4z" />
        {#if ui.muted}<path d="M16 9l5 6M21 9l-5 6" />{:else}<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />{/if}
      </svg>
    </button>
    <select class="lang" id="lang" aria-label={t('language')} title={t('language')} value={ui.lang} onchange={e => setLang(e.currentTarget.value)}>
      {#each LANGS as l (l)}<option value={l}>{l.toUpperCase()} · {I18N[l].langName}</option>{/each}
    </select>
  </div>
</header>
