import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed } from '../src/data.js';

const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const ids = (a) => a.map((t) => t.id);

test('no params: bare array by id; unknown params ignored', () => {
  const r = get({ foo: 'bar' });
  assert.ok(Array.isArray(r.body));
  assert.deepEqual(ids(r.body), seed().map((t) => t.id));
  assert.deepEqual(get(undefined).body, get({}).body);
});

test('status filter', () => {
  const all = seed();
  const r = get({ status: 'open,closed' });
  assert.deepEqual(ids(r.body), ids(all.filter((t) => ['open', 'closed'].includes(t.status))));
  assert.ok(r.body.length > 0);
});

test('assignee filter incl. none', () => {
  const all = seed();
  assert.deepEqual(ids(get({ assignee: 'none' }).body), ids(all.filter((t) => t.assignee === null)));
  assert.deepEqual(
    ids(get({ assignee: 'an,none' }).body),
    ids(all.filter((t) => t.assignee === null || t.assignee === 'an')),
  );
  assert.deepEqual(get({ assignee: 'nobody' }).body, []);
});

test('sort with id tiebreak ascending in both directions', () => {
  for (const f of ['priority', 'createdAt']) {
    for (const d of [1, -1]) {
      const r = get({ sort: (d < 0 ? '-' : '') + f });
      for (let i = 1; i < r.body.length; i++) {
        const a = r.body[i - 1], b = r.body[i];
        if (a[f] === b[f]) assert.ok(a.id < b.id);
        else assert.ok(d * (a[f] < b[f] ? -1 : 1) < 0);
      }
    }
  }
  assert.deepEqual(ids(get({ sort: '-id' }).body), ids(seed()).reverse());
});

test('pagination walks every page exactly once, all sorts and filters', () => {
  for (const sort of ['id', '-id', 'priority', '-priority', 'createdAt', '-createdAt']) {
    for (const extra of [{}, { status: 'open,in_progress', assignee: 'an,none' }]) {
      const base = { ...extra, sort };
      const expected = ids(get(base).body);
      const seen = [];
      let cursor;
      let pages = 0;
      do {
        const q = { ...base, limit: '4' };
        if (cursor) q.cursor = cursor;
        const r = get(q);
        assert.equal(r.status, 200);
        assert.ok(r.body.items.length <= 4);
        seen.push(...ids(r.body.items));
        cursor = r.body.nextCursor;
        pages++;
      } while (cursor && pages < 50);
      assert.deepEqual(seen, expected);
    }
  }
});

test('exact-fit last page has null nextCursor; empty result', () => {
  const r = get({ limit: '100' });
  assert.equal(r.body.nextCursor, null);
  assert.equal(r.body.items.length, 23);
  assert.deepEqual(get({ limit: '5', assignee: 'nobody' }).body, { items: [], nextCursor: null });
  const n = get({ status: 'open' }).body.length;
  assert.equal(get({ status: 'open', limit: String(n) }).body.nextCursor, null);
});

test('validation errors', () => {
  const cases = [
    [{ status: 'bogus' }, 'status'],
    [{ status: 'open,' }, 'status'],
    [{ status: '' }, 'status'],
    [{ assignee: '' }, 'assignee'],
    [{ assignee: 'an,' }, 'assignee'],
    [{ sort: 'title' }, 'sort'],
    [{ sort: '--id' }, 'sort'],
    [{ sort: '__proto__' }, 'sort'],
    [{ sort: '' }, 'sort'],
    [{ limit: '0' }, 'limit'],
    [{ limit: '101' }, 'limit'],
    [{ limit: '1.5' }, 'limit'],
    [{ limit: 'abc' }, 'limit'],
    [{ limit: '-1' }, 'limit'],
    [{ limit: '' }, 'limit'],
    [{ limit: '5', cursor: 'garbage!' }, 'cursor'],
    [{ limit: '5', cursor: '' }, 'cursor'],
    [{ limit: '5', cursor: Buffer.from('{"x":1}').toString('base64url') }, 'cursor'],
    [{ limit: '5', cursor: Buffer.from('null').toString('base64url') }, 'cursor'],
    [{ cursor: 'abc' }, 'cursor'],
  ];
  for (const [q, p] of cases) {
    const r = get(q);
    assert.equal(r.status, 400, JSON.stringify(q));
    assert.deepEqual(r.body, { error: `invalid_${p}` }, JSON.stringify(q));
  }
});

test('cursor bound to status/assignee/sort', () => {
  const c = get({ limit: '3', sort: 'priority', status: 'open,closed' }).body.nextCursor;
  assert.ok(c);
  assert.equal(get({ limit: '3', sort: 'priority', status: 'closed,open', cursor: c }).status, 200);
  for (const q of [
    { sort: 'priority', status: 'open' },
    { sort: '-priority', status: 'open,closed' },
    { sort: 'priority', status: 'open,closed', assignee: 'an' },
    { sort: 'priority' },
    { status: 'open,closed' },
  ]) {
    const r = get({ limit: '3', cursor: c, ...q });
    assert.deepEqual(r.body, { error: 'invalid_cursor' }, JSON.stringify(q));
  }
});
