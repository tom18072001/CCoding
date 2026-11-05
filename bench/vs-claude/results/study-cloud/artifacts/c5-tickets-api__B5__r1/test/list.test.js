import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed } from '../src/data.js';

const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const all = seed();
const order = (field, dir) => (a, b) => {
  const ka = field === 'createdAt' ? Date.parse(a[field]) : a[field];
  const kb = field === 'createdAt' ? Date.parse(b[field]) : b[field];
  return ka === kb ? a.id - b.id : (ka < kb ? -dir : dir);
};

function walk(query, limit) {
  const ids = [];
  let cursor;
  for (let i = 0; i < 100; i++) {
    const r = get({ ...query, limit: String(limit), ...(cursor ? { cursor } : {}) });
    assert.equal(r.status, 200);
    ids.push(...r.body.items.map((t) => t.id));
    if (r.body.nextCursor === null) return ids;
    cursor = r.body.nextCursor;
  }
  assert.fail('no termination');
}

test('no params: bare array by id', () => {
  const r = get({});
  assert.ok(Array.isArray(r.body));
  assert.deepEqual(r.body.map((t) => t.id), all.map((t) => t.id));
});

test('status and assignee filters', () => {
  const r = get({ status: 'open,closed', assignee: 'none,an' });
  const exp = all.filter((t) => ['open', 'closed'].includes(t.status) && (t.assignee === null || t.assignee === 'an'));
  assert.ok(exp.length > 0);
  assert.deepEqual(r.body.map((t) => t.id), exp.map((t) => t.id));
  assert.deepEqual(get({ assignee: 'none' }).body.map((t) => t.id), all.filter((t) => t.assignee === null).map((t) => t.id));
});

test('sorting with id tiebreak', () => {
  for (const s of ['priority', '-priority', 'createdAt', '-createdAt', '-id']) {
    const desc = s.startsWith('-');
    const f = desc ? s.slice(1) : s;
    const exp = [...all].sort(order(f, desc ? -1 : 1)).map((t) => t.id);
    assert.deepEqual(get({ sort: s }).body.map((t) => t.id), exp, s);
  }
});

test('pagination walks every sort/filter combination without gaps or dupes', () => {
  for (const sort of ['id', '-id', 'priority', '-priority', 'createdAt', '-createdAt']) {
    for (const limit of [1, 4, 100]) {
      const q = { sort, status: 'open,in_progress,resolved', assignee: 'none,an,binh,chi' };
      const exp = get(q).body.map((t) => t.id);
      assert.deepEqual(walk(q, limit), exp, `${sort}/${limit}`);
    }
  }
  assert.equal(get({ limit: '100' }).body.nextCursor, null);
  assert.equal(get({ limit: '23' }).body.nextCursor, null);
  assert.notEqual(get({ limit: '22' }).body.nextCursor, null);
});

test('validation errors', () => {
  const cases = [
    [{ status: 'bogus' }, 'status'], [{ status: 'open,' }, 'status'], [{ status: '' }, 'status'],
    [{ assignee: '' }, 'assignee'],
    [{ sort: 'title' }, 'sort'], [{ sort: '--id' }, 'sort'], [{ sort: '-' }, 'sort'],
    [{ limit: '0' }, 'limit'], [{ limit: '101' }, 'limit'], [{ limit: '1.5' }, 'limit'],
    [{ limit: 'abc' }, 'limit'], [{ limit: '-1' }, 'limit'], [{ limit: '' }, 'limit'],
    [{ cursor: 'abc' }, 'cursor'], [{ limit: '5', cursor: 'abc' }, 'cursor'],
    [{ limit: '5', cursor: '' }, 'cursor'],
    [{ limit: '5', cursor: Buffer.from('{"x":1}').toString('base64url') }, 'cursor'],
  ];
  for (const [q, p] of cases) {
    const r = get(q);
    assert.equal(r.status, 400, JSON.stringify(q));
    assert.deepEqual(r.body, { error: `invalid_${p}` });
  }
});

test('cursor bound to status/assignee/sort', () => {
  const base = { limit: '3', status: 'open,closed', sort: 'priority' };
  const { nextCursor } = get(base).body;
  assert.ok(nextCursor);
  assert.equal(get({ ...base, cursor: nextCursor }).status, 200);
  for (const change of [{ status: 'open' }, { sort: '-priority' }, { assignee: 'an' }]) {
    const r = get({ ...base, ...change, cursor: nextCursor });
    assert.deepEqual([r.status, r.body], [400, { error: 'invalid_cursor' }]);
  }
});

test('unknown params ignored', () => {
  assert.equal(get({ foo: 'bar' }).body.length, 23);
});
