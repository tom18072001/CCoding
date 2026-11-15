import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed } from '../src/data.js';

const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const all = seed();

test('no params: bare array sorted by id', () => {
  const r = get({});
  assert.deepEqual(r.body.map((t) => t.id), all.map((t) => t.id));
  assert.ok(Array.isArray(get(undefined).body));
});

test('status filter, multiple values', () => {
  const r = get({ status: 'open,closed' });
  assert.deepEqual(r.body.map((t) => t.id), all.filter((t) => ['open', 'closed'].includes(t.status)).map((t) => t.id));
});

test('assignee filter incl. none', () => {
  const r = get({ assignee: 'none,an' });
  assert.ok(r.body.length > 0);
  assert.ok(r.body.every((t) => t.assignee === null || t.assignee === 'an'));
  assert.equal(r.body.length, all.filter((t) => t.assignee === null || t.assignee === 'an').length);
});

test('sort with id tiebreak', () => {
  for (const [s, dir] of [['priority', 1], ['-priority', -1], ['createdAt', 1], ['-createdAt', -1], ['-id', -1]]) {
    const f = s.replace('-', '');
    const b = get({ sort: s }).body;
    for (let i = 1; i < b.length; i++) {
      const [p, c] = [b[i - 1], b[i]];
      if (f === 'id') assert.equal(Math.sign(c.id - p.id), dir);
      else if (p[f] === c[f]) assert.ok(p.id < c.id);
      else assert.equal(p[f] < c[f] ? 1 : -1, dir);
    }
  }
});

for (const sort of ['id', 'priority', '-priority', 'createdAt', '-createdAt']) {
  test(`pagination walks everything: ${sort}`, () => {
    const expected = get({ sort, status: 'open,in_progress,resolved' }).body.map((t) => t.id);
    const seen = [];
    let cursor;
    let pages = 0;
    do {
      const q = { sort, status: 'open,in_progress,resolved', limit: '4' };
      if (cursor) q.cursor = cursor;
      const r = get(q);
      assert.equal(r.status, 200);
      assert.ok(r.body.items.length <= 4);
      seen.push(...r.body.items.map((t) => t.id));
      cursor = r.body.nextCursor;
      pages++;
    } while (cursor && pages < 50);
    assert.deepEqual(seen, expected);
  });
}

test('last page has null cursor; exact fit', () => {
  const r = get({ limit: '23' });
  assert.equal(r.body.items.length, 23);
  assert.equal(r.body.nextCursor, null);
});

test('invalid params', () => {
  const cases = [
    [{ status: 'bogus' }, 'status'], [{ status: 'open,' }, 'status'], [{ status: '' }, 'status'],
    [{ sort: 'title' }, 'sort'], [{ sort: '--id' }, 'sort'], [{ sort: '' }, 'sort'],
    [{ limit: '0' }, 'limit'], [{ limit: '101' }, 'limit'], [{ limit: '1.5' }, 'limit'],
    [{ limit: 'abc' }, 'limit'], [{ limit: '-1' }, 'limit'], [{ limit: '' }, 'limit'],
    [{ cursor: 'abc' }, 'cursor'], [{ limit: '5', cursor: 'abc' }, 'cursor'],
    [{ limit: '5', cursor: '' }, 'cursor'],
    [{ limit: '5', cursor: Buffer.from('{"x":1}').toString('base64url') }, 'cursor'],
  ];
  for (const [query, p] of cases) {
    const r = get(query);
    assert.equal(r.status, 400, JSON.stringify(query));
    assert.deepEqual(r.body, { error: `invalid_${p}` });
  }
});

test('cursor without limit is invalid, even a valid one', () => {
  const c = get({ limit: '2' }).body.nextCursor;
  assert.deepEqual(get({ cursor: c }).body, { error: 'invalid_cursor' });
});

test('cursor bound to status/assignee/sort', () => {
  const base = { status: 'open,closed', assignee: 'an,none', sort: '-priority', limit: '1' };
  const c = get(base).body.nextCursor;
  assert.ok(c);
  assert.equal(get({ ...base, cursor: c }).status, 200);
  for (const change of [{ status: 'open' }, { assignee: 'an' }, { sort: 'priority' }]) {
    assert.deepEqual(get({ ...base, ...change, cursor: c }).body, { error: 'invalid_cursor' });
  }
  const { status: _s, ...noStatus } = base;
  assert.equal(get({ ...noStatus, cursor: c }).status, 400);
});

test('unknown params ignored', () => {
  assert.deepEqual(get({ foo: 'bar' }).body, all);
});
