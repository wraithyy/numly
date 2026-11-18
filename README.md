# Numly

A daily code-cracking game. Every day there is one new 5-digit code, the same for everyone.
You enter a guess, turn the wheel, and the safe tells you **how many** digits are in exactly
the right place, but never which ones.

**Play:** https://numly.jkvapil.cz

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
public/           static site, plain ES modules, no build step
  js/logic.js     pure game rules, shared with the Worker
  js/main.js      UI and game flow
  js/i18n.js      translations
  js/audio.js     synthesised sound effects
  js/fx.js        win particles
  js/friends.js   friends helpers, shared with the Durable Object
  js/friends-ui.js nickname, friend requests and live results over a WebSocket
  sw.js           offline shell (network-first, cache as fallback, API never cached)
src/worker.js     POST /api/guess, /api/friends (WebSocket), static assets
src/social.js     SQLite-backed Durable Object: players, friend requests, friendships, daily results
test/             node:test suites for the rules, translations and API
```

## Development

```sh
npm install
printf 'SECRET=%s\n' "$(openssl rand -hex 32)" > .dev.vars
npm run dev    # http://127.0.0.1:8790
npm test
```

## Deployment

```sh
npx wrangler secret put SECRET   # once
npm run deploy
```

## License

MIT
