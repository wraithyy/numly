import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, compareRows, isPub, publicId } from '../public/js/friends.js';

test('names are cleaned and capped', () => {
  assert.equal(cleanName('  Pepa\u0000  z\tBrna  '), 'Pepa z Brna');
  assert.equal([...cleanName('x'.repeat(50))].length, 20);
  assert.equal(cleanName(42), '');
});

test('public ids are stable, distinct and valid friend ids', async () => {
  const id = await publicId('player-123456');
  assert.ok(isPub(id));
  assert.equal(id, await publicId('player-123456'));
  assert.notEqual(id, await publicId('player-654321'));
  assert.ok(!isPub('player-123456'));
});

test('ranking: solved by fewest tries then time, then players still trying', () => {
  const rows = [
    { name: 'idle', tries: 0, solved: false },
    { name: 'slow', tries: 6, solved: true, solvedAt: 1 },
    { name: 'busy', tries: 4, solved: false },
    { name: 'late', tries: 3, solved: true, solvedAt: 9 },
    { name: 'early', tries: 3, solved: true, solvedAt: 2 },
  ];
  assert.deepEqual(rows.sort(compareRows).map(r => r.name), ['early', 'late', 'slow', 'busy', 'idle']);
});
