# Numly

A daily code-cracking game. Every day there is one new 5-digit code, the same for everyone.
You enter a guess, turn the wheel, and the safe tells you **how many** digits are in exactly
the right place, but never which ones.

**Play:** https://numly.jkvapil.cz

Built with Svelte 5 and Vite on Cloudflare Workers with a Durable Object; game rules are plain, dependency-free JS.

## Features

- **Safe-door interface:** a one-time-code style input, tumbler lights and a spinning wheel.
- **Mobile controls:** roll each digit with the arrows above and below it, a vertical swipe, or ArrowUp/ArrowDown.
- **Sound and haptics:** sounds are synthesised with WebAudio, so the game ships no audio files.
- **Win sequence:** the door swings open and a coin burst follows. It respects `prefers-reduced-motion`.
- **Optional notepad:** it derives from your results which digits can still go where, and how many codes remain. Turning it on is recorded in that day's result.
- **Streaks, statistics and a shareable result.**
- **Archive:** replay any safe from the last 30 days. Archive games never count toward the streak or stats, and friends only see today.
- **Weekly game** on `/week`: every ISO week draws one safe type and up to two modifiers, the same for everyone. See below.
- **Monday reminders:** an optional Web Push notification when a new weekly safe starts (on iOS, from the installed app).
- **Mutual friends, live:** share your personal link; whoever opens it sends a friend request you accept or decline. Friends see each other's tries live, counted by the server from real guesses rather than self-reported. No accounts needed.
- **Installable PWA that works offline:** history, stats and the notepad work without a connection; guesses need the server.
- **9 languages:** cs, en, sk, de, pl, es, fr, it, pt, picked from the browser and switchable.

## The weekly game

A harder safe that runs Monday to Sunday. The draw comes from `HMAC(SECRET, 'week:' + ISO week)`, so every player gets the same rules and code.

| Type | What you crack |
|---|---|
| Big safe | one 6-digit code (5 hex digits) |
| Cipher | a 5-digit code with published clues that have exactly one solution |
| Wall of boxes | a 5x5 grid; hits are reported per row and column |
| Heist | five 4-character safes; opening one reveals a link to the next |

Modifiers: hex digits, a liar (one result off by one), the digit sum up front, mastermind (right digit, wrong place), alarm (fewer tries a day) and a timer (ranked by time).

The week never locks: tries are **rationed per day**, so it pays to come back. Below the safe are notes, by hand or automatic where the code space is small enough to search; switching the automatic notes on tags you on the friends board. Friends are ranked by tries, then time; unsolved players by progress. The code is revealed when the week ends.

## How the code stays secret

The browser never sees the code. A Cloudflare Worker derives it as
`HMAC-SHA256(SECRET, date)`, so it is identical for every player and unguessable without the secret.
For each guess the Worker answers only with the number of hits.
The day is decided by the server's clock in `Europe/Prague`, so moving a device's date forward cannot unlock tomorrow's safe early.

```
web/                  Svelte 5 app (Vite)
  src/daily/          daily game: state and reveal (game.svelte.js), safe, history, notepad, dialogs, archive
  src/week/           weekly game: page, safe, clues, heist chain, notes, board, help, stats
  src/lib/            translations, sound, particles, storage, friends client over a WebSocket
  sw.js               offline shell (network-first, cache as fallback, API never cached)
shared/               pure rules shared by the Worker, the app and the tests
  logic.js            daily rules, game day, notepad deduction
  friends.js          friends helpers
  week.js             weekly game: draw, judging, ranking, notepad search
  cipher.js           cipher clues with exactly one solution
src/worker.js         POST /api/guess, /api/week, /api/friends (WebSocket), static assets
src/social.js         SQLite-backed Durable Object: players, friend requests, friendships, results
src/weekly.js         weekly game inside the Durable Object: draw cache, daily rations, judging, board
src/push.js           Web Push: VAPID signing, push-service allowlist
test/                 node:test suites
e2e/                  headless Chrome scenarios, each against its own throwaway Worker
```

## Development

```sh
npm install
printf 'SECRET=%s\n' "$(openssl rand -hex 32)" > .dev.vars
npm run api    # builds once, Worker + API on http://127.0.0.1:8790
npm run dev    # Vite with hot reload on http://127.0.0.1:5173, proxies /api to the Worker
npm test
npm run e2e    # needs Google Chrome (set CHROME to its binary elsewhere than macOS)
npm run e2e -- heist friends    # a subset
```

To try a particular weekly safe locally, pin it in `.dev.vars`: `WEEK_SPEC={"type":"heist","mods":["sum"]}`. Never set it in production.

## Deployment

```sh
npx wrangler secret put SECRET      # once
npx wrangler secret put VAPID_KEY   # once: a P-256 private key as JWK, for the Monday reminders
npm run deploy
```

A key can be made with `node -e "crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign']).then(k=>crypto.subtle.exportKey('jwk',k.privateKey)).then(j=>console.log(JSON.stringify(j)))"`; put the same kind of key in `.dev.vars` as `VAPID_KEY='...'` for local work.

## License

MIT
