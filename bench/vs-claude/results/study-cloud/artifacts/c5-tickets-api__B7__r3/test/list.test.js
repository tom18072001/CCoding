import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';

const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const all = (query) => get(query).body;

test('no params: bare array sorted by id', () => {
  const b = all({});
  assert.deepEqual(b.map((t) => t.id), [...Array(23).keys()].map((i) => i + 1));
});
test('status and assignee filters', () => {
  const b = all({ status: 'open,closed', assignee: 'none,an' });
  assert.ok(b.length > 0);
  for (const t of b) {
    assert.ok(['open', 'closed'].includes(t.status));
    assert.ok(t.assignee === null || t.assignee === 'an');
  }
  const none = all({ assignee: 'none' });
  assert.ok(none.length > 0 && none.every((t) => t.assignee === null));
});
test('sort with id tiebreak', () => {
  const d = all({ sort: '-priority' });
  for (let i = 1; i < d.length; i++) {
    assert.ok(d[i - 1].priority > d[i].priority || (d[i - 1].priority === d[i].priority && d[i - 1].id < d[i].id));
  }
  const c = all({ sort: 'createdAt' });
  for (let i = 1; i < c.length; i++) assert.ok(c[i - 1].createdAt <= c[i].createdAt);
  assert.equal(all({ sort: '-id' })[0].id, 23);
});
for (const sort of ['id', '-id', '-priority', 'priority', 'createdAt', '-createdAt']) {
  test(`pagination walks everything: ${sort}`, () => {
    const base = { sort, status: 'open,in_progress,resolved' };
    const expected = all(base).map((t) => t.id);
    const got = [];
    let cursor;
    let pages = 0;
    do {
      const r = get({ ...base, limit: '4', ...(cursor ? { cursor } : {}) });
      assert.equal(r.status, 200);
      got.push(...r.body.items.map((t) => t.id));
      cursor = r.body.nextCursor;
      pages++;
    } while (cursor);
    assert.deepEqual(got, expected);
    assert.ok(pages > 1);
  });
}
test('last page has null cursor; exact fit', () => {
  assert.equal(get({ limit: '23' }).body.nextCursor, null);
  assert.equal(get({ limit: '100' }).body.items.length, 23);
});
test('validation errors', () => {
  const cases = [
    [{ status: 'bogus' }, 'status'], [{ status: 'open,' }, 'status'], [{ assignee: '' }, 'assignee'],
    [{ sort: 'title' }, 'sort'], [{ sort: '--id' }, 'sort'],
    [{ limit: '0' }, 'limit'], [{ limit: '101' }, 'limit'], [{ limit: '1.5' }, 'limit'], [{ limit: 'abc' }, 'limit'], [{ limit: '' }, 'limit'], [{ limit: '-1' }, 'limit'],
    [{ cursor: 'abc' }, 'cursor'], [{ limit: '2', cursor: '!!' }, 'cursor'], [{ limit: '2', cursor: 'e30' }, 'cursor'],
  ];
  for (const [q, p] of cases) {
    const r = get(q);
    assert.equal(r.status, 400, JSON.stringify(q));
    assert.deepEqual(r.body, { error: `invalid_${p}` });
  }
});
test('cursor valid only with same filters', () => {
  const c = get({ limit: '2', sort: 'priority', status: 'open' }).body.nextCursor;
  assert.ok(c);
  assert.equal(get({ limit: '2', sort: 'priority', status: 'open', cursor: c }).status, 200);
  for (const q of [{ sort: '-priority', status: 'open' }, { sort: 'priority', status: 'closed' }, { sort: 'priority', status: 'open', assignee: 'an' }, { sort: 'priority' }]) {
    assert.deepEqual(get({ ...q, limit: '2', cursor: c }), { status: 400, body: { error: 'invalid_cursor' } });
  }
});
test('unknown params ignored', () => {
  assert.equal(all({ foo: 'bar' }).length, 23);
});
