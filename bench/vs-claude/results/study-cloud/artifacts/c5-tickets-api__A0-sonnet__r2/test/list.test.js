import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed } from '../src/data.js';

const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const ids = (b) => (Array.isArray(b) ? b : b.items).map((t) => t.id);

test('no params: bare array by id', () => {
  const r = get({});
  assert.deepEqual(ids(r.body), seed().map((t) => t.id));
});

test('unknown params ignored', () => {
  assert.equal(get({ foo: 'bar' }).body.length, 23);
});

test('status filter', () => {
  const r = get({ status: 'open,closed' });
  assert.ok(Array.isArray(r.body) && r.body.length > 0);
  assert.ok(r.body.every((t) => ['open', 'closed'].includes(t.status)));
  assert.equal(r.body.length, seed().filter((t) => ['open', 'closed'].includes(t.status)).length);
});

test('assignee filter incl none', () => {
  const r = get({ assignee: 'none,an' });
  assert.deepEqual(ids(r.body), seed().filter((t) => t.assignee === null || t.assignee === 'an').map((t) => t.id));
  assert.deepEqual(ids(get({ assignee: 'an' }).body), seed().filter((t) => t.assignee === 'an').map((t) => t.id));
});

test('sort with id tiebreak ascending', () => {
  for (const [q, f, d] of [['priority', 'priority', 1], ['-priority', 'priority', -1], ['createdAt', 'createdAt', 1], ['-createdAt', 'createdAt', -1]]) {
    const b = get({ sort: q }).body;
    for (let i = 1; i < b.length; i++) {
      const x = b[i - 1][f], y = b[i][f];
      if (x === y) assert.ok(b[i - 1].id < b[i].id);
      else assert.ok(d * (x < y ? -1 : 1) < 0);
    }
  }
  assert.deepEqual(ids(get({ sort: '-id' }).body), seed().map((t) => t.id).reverse());
});

test('pagination walks all pages for every sort', () => {
  for (const sort of ['id', '-id', 'priority', '-priority', 'createdAt', '-createdAt']) {
    const q = { status: 'open,in_progress,resolved', sort };
    const expected = ids(get(q).body);
    const got = [];
    let cursor;
    let pages = 0;
    do {
      const r = get({ ...q, limit: '4', ...(cursor ? { cursor } : {}) });
      assert.equal(r.status, 200);
      assert.ok(r.body.items.length <= 4);
      got.push(...ids(r.body));
      cursor = r.body.nextCursor;
      pages++;
    } while (cursor && pages < 50);
    assert.deepEqual(got, expected, sort);
  }
});

test('last page has null cursor; exact fit', () => {
  const r = get({ limit: '23' });
  assert.equal(r.body.items.length, 23);
  assert.equal(r.body.nextCursor, null);
  assert.equal(typeof get({ limit: '22' }).body.nextCursor, 'string');
});

test('invalid params', () => {
  const cases = [
    [{ status: 'nope' }, 'status'], [{ status: 'open,' }, 'status'], [{ status: '' }, 'status'],
    [{ sort: 'title' }, 'sort'], [{ sort: '--id' }, 'sort'], [{ sort: '' }, 'sort'],
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

test('cursor must match status/assignee/sort', () => {
  const c = get({ limit: '3', status: 'open', sort: 'priority' }).body.nextCursor;
  assert.ok(c);
  assert.equal(get({ limit: '3', status: 'open', sort: 'priority', cursor: c }).status, 200);
  for (const q of [{ status: 'closed', sort: 'priority' }, { status: 'open' }, { status: 'open', sort: '-priority' }, { status: 'open', sort: 'priority', assignee: 'an' }]) {
    const r = get({ limit: '3', ...q, cursor: c });
    assert.deepEqual(r.body, { error: 'invalid_cursor' });
  }
});
