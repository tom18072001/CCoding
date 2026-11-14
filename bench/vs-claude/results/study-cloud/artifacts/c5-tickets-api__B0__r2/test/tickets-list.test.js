import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed } from '../src/data.js';

const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const all = seed();
const ids = (a) => a.map((t) => t.id);

test('no params and unknown params keep bare array by id', () => {
  for (const q of [{}, undefined, { foo: 'bar' }]) {
    const r = createHandler()({ method: 'GET', path: '/tickets', query: q });
    assert.equal(r.status, 200);
    assert.deepEqual(ids(r.body), ids(all));
  }
});

test('status filter', () => {
  const r = get({ status: 'open,closed' });
  assert.deepEqual(ids(r.body), ids(all.filter((t) => ['open', 'closed'].includes(t.status))));
  assert.ok(r.body.length > 0);
});

test('assignee none and names', () => {
  assert.deepEqual(ids(get({ assignee: 'none' }).body), ids(all.filter((t) => t.assignee === null)));
  assert.deepEqual(ids(get({ assignee: 'none,an' }).body), ids(all.filter((t) => t.assignee === null || t.assignee === 'an')));
  assert.deepEqual(get({ assignee: 'nobody' }).body, []);
});

test('sort descending with id ascending tie-break', () => {
  const b = get({ sort: '-priority' }).body;
  for (let i = 1; i < b.length; i++) {
    assert.ok(b[i - 1].priority > b[i].priority || (b[i - 1].priority === b[i].priority && b[i - 1].id < b[i].id));
  }
  const c = get({ sort: 'createdAt' }).body;
  for (let i = 1; i < c.length; i++) {
    assert.ok(c[i - 1].createdAt < c[i].createdAt || (c[i - 1].createdAt === c[i].createdAt && c[i - 1].id < c[i].id));
  }
  assert.deepEqual(ids(get({ sort: '-id' }).body), ids(all).reverse());
});

function walk(query, limit) {
  const out = [];
  let cursor;
  for (let n = 0; n < 100; n++) {
    const r = get({ ...query, limit: String(limit), ...(cursor ? { cursor } : {}) });
    assert.equal(r.status, 200);
    assert.ok(r.body.items.length <= limit);
    out.push(...r.body.items);
    if (r.body.nextCursor === null) return out;
    cursor = r.body.nextCursor;
  }
  assert.fail('too many pages');
}

test('paging through all pages equals unpaged list', () => {
  for (const q of [{}, { sort: '-priority' }, { sort: 'createdAt', status: 'open,resolved' }, { sort: '-createdAt', assignee: 'none,an' }]) {
    for (const limit of [1, 3, 5, 100]) {
      assert.deepEqual(walk(q, limit), get(q).body);
    }
  }
});

test('last page has null cursor; empty result', () => {
  assert.equal(get({ limit: '100' }).body.nextCursor, null);
  assert.deepEqual(get({ limit: '5', assignee: 'nobody' }).body, { items: [], nextCursor: null });
});

test('error codes', () => {
  const cur = get({ limit: '2' }).body.nextCursor;
  const cases = [
    [{ status: 'bogus' }, 'status'],
    [{ status: 'open,,closed' }, 'status'],
    [{ status: '' }, 'status'],
    [{ assignee: 'an,' }, 'assignee'],
    [{ assignee: '' }, 'assignee'],
    [{ sort: 'title' }, 'sort'],
    [{ sort: '--id' }, 'sort'],
    [{ limit: '0' }, 'limit'],
    [{ limit: '101' }, 'limit'],
    [{ limit: '1.5' }, 'limit'],
    [{ limit: 'abc' }, 'limit'],
    [{ limit: '-1' }, 'limit'],
    [{ cursor: cur }, 'cursor'],
    [{ limit: '2', cursor: 'garbage!' }, 'cursor'],
    [{ limit: '2', cursor: Buffer.from('{"x":1}').toString('base64url') }, 'cursor'],
    [{ limit: '2', cursor: cur, sort: '-id' }, 'cursor'],
    [{ limit: '2', cursor: cur, status: 'open' }, 'cursor'],
    [{ limit: '2', cursor: cur, assignee: 'an' }, 'cursor'],
    [{ limit: '2', cursor: '' }, 'cursor'],
  ];
  for (const [q, p] of cases) {
    const r = get(q);
    assert.equal(r.status, 400, JSON.stringify(q));
    assert.deepEqual(r.body, { error: `invalid_${p}` }, JSON.stringify(q));
  }
  assert.deepEqual(get({ status: 'bogus', sort: 'x' }).body, { error: 'invalid_status' });
});

test('does not mutate input', () => {
  const t = seed().reverse();
  const copy = [...t];
  createHandler(t)({ method: 'GET', path: '/tickets', query: { sort: '-priority' } });
  assert.deepEqual(t, copy);
});
