// Runs every scenario against its own throwaway Worker: `npm run e2e` (builds first).
// Pick scenarios by name: `npm run e2e -- heist friends`.
import { cleanup, failed, startServer } from './lib.mjs';
import { archive, daily, friends } from './daily.mjs';
import { big, cipher, grid, heist, reminders } from './week.mjs';

const SCENARIOS = [
  ['daily', daily, null],
  ['archive', archive, null],
  ['friends', friends, null],
  ['big', big, { type: 'big', mods: ['mastermind'] }],
  ['cipher', cipher, { type: 'cipher', mods: [] }],
  ['grid', grid, { type: 'grid', mods: [] }],
  ['heist', heist, { type: 'heist', mods: ['sum'] }],
  ['reminders', reminders, null],
];

const only = process.argv.slice(2);
let port = 8811;
for (const [name, run, spec] of SCENARIOS) {
  if (only.length && !only.includes(name)) continue;
  console.log(name);
  const server = await startServer(port++, spec);
  try {
    await run(server);
  } catch (err) {
    console.log(`  FAIL crashed: ${err.stack}`);
    process.exitCode = 1;
  } finally {
    server.stop();
  }
}
cleanup();
if (failed()) process.exitCode = 1;
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed');
