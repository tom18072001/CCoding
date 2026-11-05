import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed, STATUSES } from '../src/data.js';

const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const all = seed();

test('no params: bare array by id', () => {
  const r = get({});
  assert.deepEqual(r.body.map((t) => t.id), all.map((t) => t.id));
  assert.ok(Array.isArray(r.body));
});
test('unknown params ignored', () => {
  assert.equal(get({ foo: 'x' }).body.length, 23);
});
test('status filter', () => {
  const r = get({ status: 'open,closed' });
  assert.ok(Array.isArray(r.body));
  assert.deepEqual(r.body.map((t) => t.id), all.filter((t) => ['open', 'closed'].includes(t.status)).map((t) => t.id));
  assert.ok(r.body.length > 0);
});
test('assignee filter incl. none', () => {
  const r = get({ assignee: 'none,an' });
  assert.deepEqual(r.body.map((t) => t.id), all.filter((t) => t.assignee === null || t.assignee === 'an').map((t) => t.id));
  assert.ok(get({ assignee: 'none' }).body.every((t) => t.assignee === null));
});
test('sort with tie-break', () => {
  for (const [s, f, d] of [['priority', 'priority', 1], ['-priority', 'priority', -1], ['createdAt', 'createdAt', 1], ['-createdAt', 'createdAt', -1], ['-id', 'id', -1]]) {
    const b = get({ sort: s }).body;
    for (let i = 1; i < b.length; i++) {
      const x = b[i - 1], y = b[i];
      if (x[f] === y[f]) assert.ok(x.id < y.id, s);
      else assert.ok((x[f] < y[f] ? 1 : -1) === d, s);
    }
  }
});
test('pagination walks everything exactly once', () => {
  for (const sort of ['id', '-id', 'priority', '-priority', '-createdAt']) {
    const q = { status: STATUSES.join(','), sort, limit: '4' };
    const ids = [];
    let r = get(q);
    for (;;) {
      assert.equal(r.status, 200);
      ids.push(...r.body.items.map((t) => t.id));
      if (r.body.nextCursor === null) break;
      assert.equal(typeof r.body.nextCursor, 'string');
      r = get({ ...q, cursor: r.body.nextCursor });
    }
    assert.deepEqual(ids, get({ status: q.status, sort }).body.map((t) => t.id));
  }
});
test('exact-fit last page has null cursor; limit 100 ok', () => {
  assert.equal(get({ limit: '23' }).body.nextCursor, null);
  assert.equal(get({ limit: '100' }).body.items.length, 23);
});
test('invalid params', () => {
  const bad = (q, e) => {
    const r = get(q);
    assert.equal(r.status, 400, JSON.stringify(q));
    assert.deepEqual(r.body, { error: e });
  };
  bad({ status: 'nope' }, 'invalid_status');
  bad({ status: 'open,' }, 'invalid_status');
  bad({ status: '' }, 'invalid_status');
  bad({ assignee: 'an,' }, 'invalid_assignee');
  bad({ sort: 'title' }, 'invalid_sort');
  bad({ sort: '--id' }, 'invalid_sort');
  bad({ sort: '' }, 'invalid_sort');
  for (const l of ['0', '101', '1.5', 'abc', '', '-1', '1e1']) bad({ limit: l }, 'invalid_limit');
  bad({ cursor: 'abc' }, 'invalid_cursor');
  const c = get({ limit: '2' }).body.nextCursor;
  bad({ cursor: c }, 'invalid_cursor'); // no limit
  bad({ limit: '2', cursor: 'garbage!!' }, 'invalid_cursor');
  bad({ limit: '2', cursor: c, sort: 'priority' }, 'invalid_cursor');
  bad({ limit: '2', cursor: c, status: 'open' }, 'invalid_cursor');
  bad({ limit: '2', cursor: c, assignee: 'an' }, 'invalid_cursor');
  assert.equal(get({ limit: '2', cursor: c, sort: 'id' }).status, 200);
});
