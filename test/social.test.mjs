import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Social } from '../src/social.js';
import { fakeCtx } from './helpers/fake-ctx.mjs';

const DAY = '2026-11-18';
const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccc';

function setup() {
  const s = new Social(fakeCtx());
  s.touch(A, 'Ann');
  s.touch(B, 'Bob');
  s.touch(C, 'Cy');
  return s;
}

test('a request needs approval before results are shared', () => {
  const s = setup();
  assert.equal(s.request(B, A), 'sent');
  assert.deepEqual(s.state(A, DAY).incoming, [{ pub: B, name: 'Bob' }]);
  assert.deepEqual(s.state(B, DAY).outgoing, [{ pub: A, name: 'Ann' }]);
  assert.deepEqual(s.state(A, DAY).rows.map(r => r.pub), [A]); // not friends yet

  assert.equal(s.accept(A, B), true);
  assert.deepEqual(s.state(A, DAY).rows.map(r => r.name).sort(), ['Ann', 'Bob']);
  assert.deepEqual(s.state(B, DAY).rows.map(r => r.name).sort(), ['Ann', 'Bob']);
  assert.deepEqual(s.state(A, DAY).incoming, []);
});

test('declined and cancelled requests disappear without a friendship', () => {
  const s = setup();
  s.request(B, A);
  s.reject(A, B);
  assert.deepEqual(s.state(A, DAY).incoming, []);
  assert.equal(s.accept(A, B), false);
  s.request(C, A);
  s.cancel(C, A);
  assert.deepEqual(s.state(A, DAY).incoming, []);
  assert.deepEqual(s.state(A, DAY).rows.map(r => r.pub), [A]);
});

test('requesting someone who already asked you makes you friends at once', () => {
  const s = setup();
  s.request(A, B);
  assert.equal(s.request(B, A), 'accepted');
  assert.equal(s.request(B, A), 'friends');
  assert.equal(s.state(A, DAY).outgoing.length, 0);
});

test('self, unknown and duplicate requests are handled', () => {
  const s = setup();
  assert.equal(s.request(A, A), 'self');
  assert.equal(s.request(A, 'dddddddddddddddd'), 'unknown');
  assert.equal(s.request(A, B), 'sent');
  assert.equal(s.request(A, B), 'sent');
  assert.equal(s.state(B, DAY).incoming.length, 1);
});

test('unfriending is mutual', () => {
  const s = setup();
  s.request(A, B);
  s.accept(B, A);
  s.unfriend(B, A);
  assert.deepEqual(s.state(A, DAY).rows.map(r => r.pub), [A]);
  assert.deepEqual(s.state(B, DAY).rows.map(r => r.pub), [B]);
});

test('guesses count tries until solved, the notepad flag sticks, results are per day', () => {
  const s = setup();
  s.request(A, B);
  s.accept(B, A);
  s.recordGuess({ pub: B, hits: 1, at: 1 }, DAY);
  s.markPad(B, DAY);
  s.recordGuess({ pub: B, hits: 5, at: 2 }, DAY);
  s.recordGuess({ pub: B, hits: 0, at: 3 }, DAY);
  s.recordGuess({ pub: A, name: 'Annie', hits: 2, at: 4 }, DAY);

  const rows = s.state(A, DAY).rows;
  assert.deepEqual(rows[0], { pub: B, name: 'Bob', tries: 2, solved: true, pad: true, solvedAt: 2 });
  assert.deepEqual(rows[1], { pub: A, name: 'Annie', tries: 1, solved: false, pad: false, solvedAt: null });
  assert.equal(s.state(A, '2026-11-19').rows.every(r => r.tries === 0), true);
});

test('related covers friends and both sides of pending requests', () => {
  const s = setup();
  s.request(A, B);
  s.accept(B, A);
  s.request(C, A);
  assert.deepEqual(s.related(A).sort(), [A, B, C].sort());
});

test('rank: share of other solvers who needed more tries, once enough have solved', () => {
  const s = new Social(fakeCtx());
  const day = '2026-11-20';
  const solve = (pub, tries) => {
    for (let i = 1; i < tries; i++) s.recordGuess({ pub, hits: 1, at: 0 }, day);
    s.recordGuess({ pub, hits: 5, at: 0 }, day);
  };
  solve(A, 4);
  solve(B, 6);
  solve(C, 4); // a tie is not beaten
  assert.equal(s.rankOf(A, day), null, 'too few others yet');
  solve('dddddddddddddddd', 9);
  s.recordGuess({ pub: 'eeeeeeeeeeeeeeee', hits: 2, at: 0 }, day); // still playing: not compared
  assert.deepEqual(s.rankOf(A, day), { beaten: 67, peers: 3 });
  assert.deepEqual(s.rankOf(B, day), { beaten: 33, peers: 3 });
  assert.equal(s.rankOf('eeeeeeeeeeeeeeee', day), null, 'not solved');
});
