# Numly

A daily code-cracking game. Every day there is one new 5-digit code, the same for everyone.
You enter a guess, turn the wheel, and the safe tells you **how many** digits are in exactly
the right place, but never which ones.

**Play:** https://numly.jkvapil.cz

## Features

- **Safe-door interface:** a one-time-code style input, tumbler lights and a spinning wheel.
- **Sound and haptics:** sounds are synthesised with WebAudio, so the game ships no audio files.
- **Win sequence:** the door swings open and a coin burst follows. It respects `prefers-reduced-motion`.
- **Optional notepad:** it derives from your results which digits can still go where, and how many codes remain. Turning it on is recorded in that day's result.
- **Streaks, statistics and a shareable result.**
- **9 languages:** cs, en, sk, de, pl, es, fr, it, pt, picked from the browser and switchable.

## How the code stays secret

The browser never sees the code. A Cloudflare Worker derives it as
`HMAC-SHA256(SECRET, date)`, so it is identical for every player and unguessable without the secret.
For each guess the Worker answers only with the number of hits.

```
public/           static site, plain ES modules, no build step
  js/logic.js     pure game rules, shared with the Worker
  js/main.js      UI and game flow
  js/i18n.js      translations
  js/audio.js     synthesised sound effects
  js/fx.js        win particles
src/worker.js     POST /api/guess, everything else is served from public/
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
