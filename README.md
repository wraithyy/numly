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
- **Mutual friends, live:** share your personal link; whoever opens it sends a friend request you accept or decline. Friends see each other's tries live, counted by the server from real guesses rather than self-reported. No accounts needed.
- **Installable PWA that works offline:** history, stats and the notepad work without a connection; guesses need the server.
- **9 languages:** cs, en, sk, de, pl, es, fr, it, pt, picked from the browser and switchable.

## How the code stays secret

The browser never sees the code. A Cloudflare Worker derives it as
`HMAC-SHA256(SECRET, date)`, so it is identical for every player and unguessable without the secret.
For each guess the Worker answers only with the number of hits.
The day is decided by the server's clock in `Europe/Prague`, so moving a device's date forward cannot unlock tomorrow's safe early.

```
web/                  Svelte 5 app (Vite)
  src/daily/          daily game: state and reveal (game.svelte.js), safe, history, notepad, dialogs
  src/lib/            translations, sound, particles, storage, friends client over a WebSocket
  sw.js               offline shell (network-first, cache as fallback, API never cached)
shared/               pure rules shared by the Worker, the app and the tests
  logic.js            daily rules, game day, notepad deduction
  friends.js          friends helpers
  week.js             weekly game: draw, judging, ranking
src/worker.js         POST /api/guess, /api/friends (WebSocket), static assets
src/social.js         SQLite-backed Durable Object: players, friend requests, friendships, results
test/                 node:test suites
```

## Development

```sh
npm install
printf 'SECRET=%s\n' "$(openssl rand -hex 32)" > .dev.vars
npm run api    # builds once, Worker + API on http://127.0.0.1:8790
npm run dev    # Vite with hot reload on http://127.0.0.1:5173, proxies /api to the Worker
npm test
```

## Deployment

```sh
npx wrangler secret put SECRET   # once
npm run deploy
```

## License

MIT
