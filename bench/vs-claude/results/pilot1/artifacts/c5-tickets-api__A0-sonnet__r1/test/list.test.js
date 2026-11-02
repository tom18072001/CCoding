import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed } from '../src/data.js';

const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const ids = (arr) => arr.map((t) => t.id);

test('no params: bare array sorted by id', () => {
  const r = get({});
  assert.ok(Array.isArray(r.body));
  assert.deepEqual(ids(r.body), seed().map((t) => t.id));
});

test('unknown params ignored', () => {
  assert.equal(get({ foo: 'bar' }).body.length, 23);
});

test('status filter', () => {
  const r = get({ status: 'open,closed' });
  assert.ok(r.body.length > 0);
  assert.ok(r.body.every((t) => ['open', 'closed'].includes(t.status)));
  assert.equal(r.body.length, seed().filter((t) => ['open', 'closed'].includes(t.status)).length);
});

test('assignee filter incl. none', () => {
  const a = get({ assignee: 'none' }).body;
  assert.deepEqual(ids(a), [5, 10, 15, 20]);
  const b = get({ assignee: 'an,none' }).body;
  assert.ok(b.every((t) => t.assignee === null || t.assignee === 'an'));
  assert.ok(b.length > a.length);
});

test('sort with tie-break by id ascending', () => {
  for (const [sort, f] of [['priority', 'priority'], ['-priority', 'priority'], ['createdAt', 'createdAt'], ['-createdAt', 'createdAt']]) {
    const body = get({ sort }).body;
    const desc = sort.startsWith('-');
    for (let i = 1; i < body.length; i++) {
      const p = body[i - 1], c = body[i];
      const pv = f === 'createdAt' ? Date.parse(p[f]) : p[f];
      const cv = f === 'createdAt' ? Date.parse(c[f]) : c[f];
      if (pv === cv) assert.ok(p.id < c.id);
      else assert.ok(desc ? pv > cv : pv < cv);
    }
  }
  const d = get({ sort: '-id' }).body;
  assert.equal(d[0].id, 23);
});

test('pagination walks all items without dupes for every sort', () => {
  for (const sort of ['id', '-id', 'priority', '-priority', 'createdAt', '-createdAt']) {
    const expected = ids(get({ sort, status: 'open,in_progress,resolved', assignee: 'an,none,chi' }).body);
    const seen = [];
    let cursor;
    let pages = 0;
    do {
      const q = { sort, limit: '4', status: 'open,in_progress,resolved', assignee: 'an,none,chi' };
      if (cursor) q.cursor = cursor;
      const r = get(q);
      assert.equal(r.status, 200);
      seen.push(...ids(r.body.items));
      cursor = r.body.nextCursor;
      pages++;
      assert.ok(pages < 50);
    } while (cursor);
    assert.deepEqual(seen, expected, sort);
  }
});

test('exact-multiple last page has null cursor; limit response shape', () => {
  const r = get({ limit: '23' });
  assert.equal(r.body.items.length, 23);
  assert.equal(r.body.nextCursor, null);
  assert.equal(typeof get({ limit: '5' }).body.nextCursor, 'string');
});

test('cursor equivalent filter ordering accepted, mismatch rejected', () => {
  const c = get({ limit: '2', status: 'open,closed' }).body.nextCursor;
  assert.equal(get({ limit: '2', status: 'closed,open', cursor: c }).status, 200);
  for (const q of [{ status: 'open' }, { assignee: 'an' }, { sort: 'priority' }, {}]) {
    const r = get({ limit: '2', cursor: c, ...q });
    assert.deepEqual([r.status, r.body], [400, { error: 'invalid_cursor' }]);
  }
});

test('validation errors', () => {
  const cases = [
    [{ status: 'bogus' }, 'status'],
    [{ status: 'open,bogus' }, 'status'],
    [{ status: '' }, 'status'],
    [{ sort: 'title' }, 'sort'],
    [{ sort: '--id' }, 'sort'],
    [{ sort: '-' }, 'sort'],
    [{ limit: '0' }, 'limit'],
    [{ limit: '101' }, 'limit'],
    [{ limit: '1.5' }, 'limit'],
    [{ limit: 'abc' }, 'limit'],
    [{ limit: '-3' }, 'limit'],
    [{ limit: '' }, 'limit'],
    [{ limit: '5', cursor: 'garbage!!' }, 'cursor'],
    [{ limit: '5', cursor: Buffer.from('{"x":1}').toString('base64url') }, 'cursor'],
    [{ limit: '5', cursor: '' }, 'cursor'],
    [{ cursor: 'abc' }, 'cursor'],
  ];
  for (const [q, p] of cases) {
    const r = get(q);
    assert.deepEqual([r.status, r.body], [400, { error: `invalid_${p}` }], JSON.stringify(q));
  }
  assert.equal(get({ limit: '100' }).status, 200);
  assert.equal(get({ limit: '1' }).status, 200);
});

test('filters apply without limit and body stays array', () => {
  const r = get({ sort: '-priority', status: 'open' });
  assert.ok(Array.isArray(r.body));
});
