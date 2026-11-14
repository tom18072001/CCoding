import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });

test('no params: bare array by id', () => {
  const r = get({});
  assert.deepEqual(r.body.map((t) => t.id), Array.from({ length: 23 }, (_, i) => i + 1));
});
test('status and assignee filters', () => {
  const r = get({ status: 'open,closed', assignee: 'none,an' });
  assert.ok(Array.isArray(r.body) && r.body.length > 0);
  for (const t of r.body) {
    assert.ok(['open', 'closed'].includes(t.status));
    assert.ok(t.assignee === null || t.assignee === 'an');
  }
});
test('sort with id tiebreak', () => {
  for (const sort of ['priority', '-priority', 'createdAt', '-createdAt', '-id']) {
    const b = get({ sort }).body;
    const f = sort.replace('-', '');
    const d = sort[0] === '-' ? -1 : 1;
    for (let i = 1; i < b.length; i++) {
      const c = d * (b[i - 1][f] < b[i][f] ? -1 : b[i - 1][f] > b[i][f] ? 1 : 0);
      assert.ok(c < 0 || (c === 0 && b[i - 1].id < b[i].id));
    }
  }
});
test('pagination covers everything exactly once', () => {
  for (const sort of ['id', '-priority', 'createdAt']) {
    const q = { status: 'open,in_progress,resolved', sort };
    const all = get(q).body.map((t) => t.id);
    const seen = [];
    let cursor;
    do {
      const r = get({ ...q, limit: '4', ...(cursor ? { cursor } : {}) });
      assert.equal(r.status, 200);
      seen.push(...r.body.items.map((t) => t.id));
      cursor = r.body.nextCursor;
    } while (cursor);
    assert.deepEqual(seen, all);
  }
});
test('last page has null cursor', () => {
  assert.equal(get({ limit: '100' }).body.nextCursor, null);
  assert.equal(get({ limit: '100' }).body.items.length, 23);
});
test('validation', () => {
  const e = (q, p) => assert.deepEqual(get(q), { status: 400, body: { error: `invalid_${p}` } });
  e({ status: 'open,bogus' }, 'status');
  e({ sort: 'title' }, 'sort');
  e({ sort: '--id' }, 'sort');
  for (const l of ['0', '101', '1.5', 'abc', '', '-1']) e({ limit: l }, 'limit');
  e({ cursor: 'x' }, 'cursor');
  e({ limit: '2', cursor: 'garbage' }, 'cursor');
  const c = get({ limit: '2', sort: 'priority' }).body.nextCursor;
  e({ limit: '2', sort: 'priority', cursor: c, status: 'open' }, 'cursor');
  e({ limit: '2', sort: '-priority', cursor: c }, 'cursor');
  e({ limit: '2', sort: 'priority', cursor: c, assignee: 'an' }, 'cursor');
  assert.equal(get({ limit: '2', sort: 'priority', cursor: c }).status, 200);
  assert.equal(get({ foo: 'bar' }).status, 200);
});
