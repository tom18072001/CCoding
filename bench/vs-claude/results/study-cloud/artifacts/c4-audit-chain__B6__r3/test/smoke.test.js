import test from 'node:test';
import assert from 'node:assert/strict';
import { append, verify } from '../src/index.js';
test('append then verify', () => {
  const c = [];
  append(c, { actor: 'svc-a', action: 'read', ts: '2026-10-01T00:00:00Z' });
  assert.deepEqual(verify(c), { ok: true });
});
