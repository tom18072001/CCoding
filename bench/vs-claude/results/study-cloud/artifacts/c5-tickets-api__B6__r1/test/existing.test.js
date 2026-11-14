import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
test('list returns all tickets sorted by id', () => {
  const r = createHandler()({ method: 'GET', path: '/tickets', query: {} });
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 23);
  assert.equal(r.body[0].id, 1);
});
