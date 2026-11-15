import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed } from '../src/data.js';
const get = (query = {}) => createHandler()({ method: 'GET', path: '/tickets', query });
const all = seed();
const ids = (arr) => arr.map((t) => t.id);
function cmp(f, desc) { return (a, b) => { const c = a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : 0; return (desc ? -c : c) || a.id - b.id; }; }

test('backward compatible bare array', () => {
  const r = get();
  assert.ok(Array.isArray(r.body));
  assert.deepEqual(ids(r.body), ids([...all].sort((a, b) => a.id - b.id)));
});
test('status filter with multiple values', () => {
  const r = get({ status: 'open,closed' });
  assert.deepEqual(ids(r.body), ids(all.filter((t) => ['open', 'closed'].includes(t.status))));
});
test('assignee filter with none', () => {
  const r = get({ assignee: 'none,an' });
  assert.deepEqual(ids(r.body), ids(all.filter((t) => t.assignee === null || t.assignee === 'an')));
});
test('sort desc with id tiebreak ascending', () => {
  assert.deepEqual(ids(get({ sort: '-priority' }).body), ids([...all].sort(cmp('priority', true))));
  assert.deepEqual(ids(get({ sort: 'createdAt' }).body), ids([...all].sort(cmp('createdAt', false))));
});
test('pagination walks all filtered+sorted items exactly once', () => {
  const want = ids(all.filter((t) => t.status !== 'closed').sort(cmp('priority', true)));
  const q = { status: 'open,in_progress,resolved', sort: '-priority', limit: '4' };
  let got = [], r = get(q), pages = 0;
  while (true) { assert.equal(r.status, 200); assert.ok(!Array.isArray(r.body)); got.push(...ids(r.body.items)); pages++; if (!r.body.nextCursor) break; r = get({ ...q, cursor: r.body.nextCursor }); }
  assert.deepEqual(got, want);
  assert.equal(pages, Math.ceil(want.length / 4));
});
test('limit without cursor returns first page object', () => {
  const r = get({ limit: '100' });
  assert.equal(r.body.items.length, 23);
  assert.equal(r.body.nextCursor, null);
});
test('validation errors', () => {
  for (const [q, e] of [[{ status: 'pending' }, 'invalid_status'], [{ sort: 'title' }, 'invalid_sort'], [{ sort: '-x' }, 'invalid_sort'], [{ limit: '0' }, 'invalid_limit'], [{ limit: '101' }, 'invalid_limit'], [{ limit: '2.5' }, 'invalid_limit'], [{ limit: 'abc' }, 'invalid_limit'], [{ limit: '5', cursor: '!!!' }, 'invalid_cursor'], [{ cursor: 'abc' }, 'invalid_cursor']]) {
    const r = get(q);
    assert.equal(r.status, 400, JSON.stringify(q));
    assert.deepEqual(r.body, { error: e });
  }
});
test('cursor rejected when filters change', () => {
  const r = get({ status: 'open', limit: '1' });
  assert.ok(r.body.nextCursor);
  const r2 = get({ status: 'closed', limit: '1', cursor: r.body.nextCursor });
  assert.equal(r2.status, 400);
  assert.deepEqual(r2.body, { error: 'invalid_cursor' });
});
test('unknown params ignored and single ticket route intact', () => {
  assert.equal(get({ foo: 'bar' }).body.length, 23);
  const h = createHandler();
  assert.equal(h({ method: 'GET', path: '/tickets/3', query: {} }).body.id, 3);
  assert.equal(h({ method: 'GET', path: '/tickets/99', query: {} }).status, 404);
});
