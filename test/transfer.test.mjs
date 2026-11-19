import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Social } from '../src/social.js';
import { fakeCtx } from './helpers/fake-ctx.mjs';
import { CODE_RE, MAX_LIVE_TRANSFERS, MAX_TRANSFER, TRANSFER_MS, formatCode, newCode, normalizeCode } from '../shared/transfer.js';

const P = 'player-0001-aaaa';
const DATA = JSON.stringify({ 'numly-stats': '{"won":3}' });

test('codes avoid look-alike characters and survive the way people type them', () => {
  for (let i = 0; i < 200; i++) assert.match(newCode(), CODE_RE);
  assert.equal(formatCode('K7QAMZ4P'), 'K7QA-MZ4P');
  assert.equal(normalizeCode(' k7qa-mz4p '), 'K7QAMZ4P');
  assert.equal(normalizeCode('K7QA MZ4'), null); // too short
  assert.equal(normalizeCode('K7QA-MZ40'), null); // 0 is never used
});

test('a code hands the profile over once', () => {
  const s = new Social(fakeCtx());
  const { code } = s.createTransfer(P, DATA, 1000, 'ip');
  assert.deepEqual(s.claimTransfer(code, 2000, 'ip'), { player: P, data: DATA });
  assert.equal(s.claimTransfer(code, 2001, 'ip').error, 'not found');
});

test('a code expires, and a new one replaces the old', () => {
  const s = new Social(fakeCtx());
  const first = s.createTransfer(P, DATA, 0, 'ip').code;
  const second = s.createTransfer(P, DATA, 10, 'ip').code;
  assert.equal(s.claimTransfer(first, 20, 'ip').error, 'not found');
  assert.equal(s.claimTransfer(second, 10 + TRANSFER_MS + 1, 'ip').error, 'not found');
});

test('oversized or malformed profiles are refused', () => {
  const s = new Social(fakeCtx());
  assert.equal(s.createTransfer(P, 'x'.repeat(MAX_TRANSFER + 1), 0, 'ip').error, 'too large');
  assert.equal(s.createTransfer(P, '[1,2]', 0, 'ip').error, 'invalid');
  assert.equal(s.createTransfer(P, 'not json', 0, 'ip').error, 'invalid');
});

test('guessing is limited per address, so one guesser cannot block everyone else', () => {
  const s = new Social(fakeCtx());
  const { code } = s.createTransfer(P, DATA, 0, 'owner');
  let res;
  for (let i = 0; i < 100 && !res?.limited; i++) res = s.claimTransfer('AAAAAAAA', 1000, 'guesser');
  assert.equal(res.limited, true);
  assert.equal(s.claimTransfer(code, 1000, 'guesser').limited, true); // the guesser waits out the minute
  assert.deepEqual(s.claimTransfer(code, 1000, 'someone-else'), { player: P, data: DATA });
});

test('creating codes is limited per address and in total, and expired snapshots are deleted', () => {
  const s = new Social(fakeCtx());
  let res;
  for (let i = 0; i < 100 && !res?.limited; i++) res = s.createTransfer(`player-${String(i).padStart(4, '0')}-x`, DATA, 0, 'flood');
  assert.equal(res.limited, true);
  for (let i = 0; i < MAX_LIVE_TRANSFERS + 5 && !res?.error; i++) res = s.createTransfer(`player-${String(i).padStart(4, '0')}-y`, DATA, 0, `ip${i}`);
  assert.equal(res.error, 'busy');
  s.claimTransfer('AAAAAAAA', TRANSFER_MS + 1, 'later');
  assert.equal(s.q(`SELECT COUNT(*) AS n FROM transfers`)[0].n, 0); // nothing outlives its ten minutes
});
