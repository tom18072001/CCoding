import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed } from '../src/data.js';

const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const ids = (b) => b.map((t) => t.id);

function walk(query, limit) {
  const all = [];
  let cursor;
  for (let i = 0; i < 100; i++) {
    const r = get({ ...query, limit: String(limit), ...(cursor ? { cursor } : {}) });
    assert.equal(r.status, 200);
    all.push(...r.body.items);
    cursor = r.body.nextCursor;
    if (cursor === null) return all;
  }
  throw new Error('no end');
}

test('filters by status and assignee', () => {
  const r = get({ status: 'open,closed', assignee: 'an,none' });
  const exp = seed().filter((t) => ['open', 'closed'].includes(t.status) && (t.assignee === null || t.assignee === 'an'));
  assert.deepEqual(ids(r.body), exp.map((t) => t.id));
  assert.ok(exp.length > 0);
  assert.deepEqual(ids(get({ assignee: 'none' }).body), [5, 10, 15, 20]);
});

test('sorting with id tiebreak', () => {
  for (const s of ['priority', '-priority', 'createdAt', '-createdAt', '-id']) {
    const f = s.replace('-', '');
    const d = s.startsWith('-') ? -1 : 1;
    const exp = seed().sort((a, b) => d * (a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : 0) || a.id - b.id);
    assert.deepEqual(ids(get({ sort: s }).body), ids(exp), s);
  }
});

test('pagination walks every sort without gaps or duplicates', () => {
  for (const sort of ['id', '-id', 'priority', '-priority', 'createdAt', '-createdAt']) {
    for (const limit of [1, 5, 23, 100]) {
      const q = { sort, status: 'open,in_progress,resolved' };
      assert.deepEqual(ids(walk(q, limit)), ids(get(q).body), `${sort}/${limit}`);
    }
  }
});

test('last page has null cursor; shape with limit', () => {
  const r = get({ limit: '100' });
  assert.equal(r.body.items.length, 23);
  assert.equal(r.body.nextCursor, null);
  assert.equal(typeof get({ limit: '2' }).body.nextCursor, 'string');
});

test('validation errors', () => {
  const cur = get({ limit: '2', sort: 'priority' }).body.nextCursor;
  const cases = [
    [{ status: 'bogus' }, 'status'],
    [{ status: 'open,' }, 'status'],
    [{ sort: 'title' }, 'sort'],
    [{ sort: '--id' }, 'sort'],
    [{ limit: '0' }, 'limit'],
    [{ limit: '101' }, 'limit'],
    [{ limit: '1.5' }, 'limit'],
    [{ limit: 'abc' }, 'limit'],
    [{ limit: '' }, 'limit'],
    [{ limit: '2', cursor: 'garbage!' }, 'cursor'],
    [{ limit: '2', cursor: Buffer.from('{"x":1}').toString('base64url') }, 'cursor'],
    [{ limit: '2', cursor: cur }, 'cursor'], // sort mismatch (default id)
    [{ limit: '2', cursor: cur, sort: 'priority', status: 'open' }, 'cursor'],
    [{ cursor: cur, sort: 'priority' }, 'cursor'],
  ];
  for (const [q, p] of cases) {
    const r = get(q);
    assert.equal(r.status, 400, JSON.stringify(q));
    assert.deepEqual(r.body, { error: `invalid_${p}` });
  }
});

test('no params unchanged; unknown params ignored', () => {
  assert.deepEqual(get({}).body, seed());
  assert.deepEqual(get({ foo: 'bar' }).body, seed());
});
