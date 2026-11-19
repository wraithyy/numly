<script>
  // Privacy policy, in Czech and English (every other language gets the English one).
  // Keep it in step with what the code actually stores: src/social.js, src/weekly.js, shared/transfer.js.
  import { ui } from './lib/app.svelte.js';

  const cs = $derived(ui.lang === 'cs' || ui.lang === 'sk');
  const CONTACT = 'numly@jkvapil.cz';
  const GITHUB = 'https://github.com/wraithyy';
</script>

<main class="privacy">
  <a class="back" href="/">← Numly</a>
  {#if cs}
    <h1>Ochrana soukromí</h1>
    <p class="note">Platné od 19. 11. 2026</p>

    <h2>Kdo hru provozuje</h2>
    <p>Josef Kvapil, <a href="mailto:{CONTACT}">{CONTACT}</a>, <a href={GITHUB} target="_blank" rel="noopener noreferrer">GitHub</a>. Na e-mail pište s jakoukoli otázkou nebo žádostí o smazání.</p>

    <h2>Co zůstává jen ve vašem zařízení</h2>
    <p>Postup hry, statistiky, série, historie, poznámky, nastavení a náhodné ID hráče jsou uložené v prohlížeči (localStorage). Nikam se neposílají, dokud nehrajete s přáteli, nepřenášíte profil ani neposíláte tip. Smažete je vymazáním dat tohoto webu v prohlížeči.</p>

    <h2>Co ukládá server</h2>
    <ul>
      <li><b>Zkrácený otisk (hash) ID hráče</b>, nikdy ne ID samotné, a přezdívka, pokud si ji nastavíte. Zůstávají, dokud nepožádáte o smazání.</li>
      <li><b>Denní výsledky</b> (počet pokusů, vyřešeno, použití poznámkového bloku, čas): 3 dny. Slouží pro přátele a pro pořadí mezi hráči.</li>
      <li><b>Týdenní pokusy</b>: 3 týdny.</li>
      <li><b>Přátelé a žádosti o přátelství</b>: dokud je nezrušíte.</li>
      <li><b>Adresa pro připomenutí</b> od služby push vašeho prohlížeče, jen pokud připomenutí zapnete: dokud je nevypnete.</li>
      <li><b>Přenos profilu</b>: kopie profilu včetně ID hráče, nejdéle 10 minut nebo do použití kódu. Pro ochranu před zneužitím se po dobu jedné minuty v paměti počítají pokusy podle IP adresy.</li>
    </ul>

    <h2>Kdo další se k datům dostane</h2>
    <ul>
      <li><b>Cloudflare</b> hru hostuje a provozuje její server. Při doručení stránky zpracovává technické údaje o požadavku, například IP adresu. Návštěvnost měří pomocí Cloudflare Web Analytics, které nepoužívá cookies.</li>
      <li><b>Služba push vašeho prohlížeče</b> (Google, Apple nebo Mozilla) doručuje připomenutí, pokud je zapnete.</li>
      <li><b>Buy Me a Coffee</b> jen tehdy, když kliknete na odkaz v patičce.</li>
    </ul>
    <p>Hra sama nepoužívá cookies ani reklamu a data nikomu neprodává. Písma jsou uložená přímo u hry.</p>

    <h2>Vaše práva</h2>
    <p>Můžete požádat o informaci, jaká data o vás server má, o jejich opravu nebo smazání. Stačí napsat e-mail; pro dohledání pošlete své ID hráče (najdete ho v prohlížeči pod klíčem <code>numly-player</code>), nebo přezdívku. Stížnost můžete podat u Úřadu pro ochranu osobních údajů (uoou.gov.cz).</p>
  {:else}
    <h1>Privacy</h1>
    <p class="note">Effective 19 November 2026</p>

    <h2>Who runs the game</h2>
    <p>Josef Kvapil, <a href="mailto:{CONTACT}">{CONTACT}</a>, <a href={GITHUB} target="_blank" rel="noopener noreferrer">GitHub</a>. Email with any question or request to delete data.</p>

    <h2>What stays on your device</h2>
    <p>Game progress, stats, streaks, history, notes, settings and a random player id are kept in your browser (localStorage). None of it is sent anywhere unless you play with friends, move your profile or submit a guess. Clearing this site's data in your browser deletes it.</p>

    <h2>What the server stores</h2>
    <ul>
      <li><b>A shortened hash of your player id</b>, never the id itself, and your nickname if you set one. Kept until you ask for deletion.</li>
      <li><b>Daily results</b> (number of tries, solved, notepad use, time): 3 days. Used for friends and for the ranking among players.</li>
      <li><b>Weekly tries</b>: 3 weeks.</li>
      <li><b>Friends and friend requests</b>: until you remove them.</li>
      <li><b>A reminder address</b> from your browser's push service, only if you turn reminders on: until you turn them off.</li>
      <li><b>Profile transfer</b>: a copy of your profile including the player id, for at most 10 minutes or until the code is used. To prevent abuse, attempts are counted in memory per IP address for one minute.</li>
    </ul>

    <h2>Who else handles data</h2>
    <ul>
      <li><b>Cloudflare</b> hosts the game and runs its server. Delivering a page means processing technical request data such as your IP address. Visits are measured with Cloudflare Web Analytics, which uses no cookies.</li>
      <li><b>Your browser's push service</b> (Google, Apple or Mozilla) delivers reminders if you turn them on.</li>
      <li><b>Buy Me a Coffee</b>, only if you follow the link in the footer.</li>
    </ul>
    <p>The game itself sets no cookies and shows no ads, and sells no data. Fonts are served by the game itself.</p>

    <h2>Your rights</h2>
    <p>You can ask what data the server holds about you, and have it corrected or deleted, by email. To find it, send your player id (stored in your browser under <code>numly-player</code>) or your nickname. You can also complain to your data protection authority.</p>
  {/if}
</main>
