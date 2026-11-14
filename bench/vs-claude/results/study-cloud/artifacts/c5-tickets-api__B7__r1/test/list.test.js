import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed } from '../src/data.js';

const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const ids = (r) => (Array.isArray(r.body) ? r.body : r.body.items).map((t) => t.id);

test('no params: bare array by id', () => {
  assert.deepEqual(ids(get({})), seed().map((t) => t.id));
});
test('status filter and unknown params ignored', () => {
  const r = get({ status: 'open,closed', foo: 'x' });
  assert.ok(Array.isArray(r.body) && r.body.length > 0);
  assert.ok(r.body.every((t) => ['open', 'closed'].includes(t.status)));
});
test('assignee none and names', () => {
  assert.ok(get({ assignee: 'none' }).body.every((t) => t.assignee === null));
  const r = get({ assignee: 'none,an' }).body;
  assert.equal(r.length, seed().filter((t) => t.assignee === null || t.assignee === 'an').length);
});
test('sort priority desc with id asc ties', () => {
  const b = get({ sort: '-priority' }).body;
  for (let i = 1; i < b.length; i++) {
    assert.ok(b[i - 1].priority > b[i].priority || (b[i - 1].priority === b[i].priority && b[i - 1].id < b[i].id));
  }
});
test('sort createdAt asc', () => {
  const b = get({ sort: 'createdAt' }).body;
  for (let i = 1; i < b.length; i++) assert.ok(b[i - 1].createdAt <= b[i].createdAt);
});
for (const sort of ['id', '-id', 'priority', '-priority', 'createdAt', '-createdAt']) {
  test(`pagination walks everything exactly once: ${sort}`, () => {
    const h = createHandler();
    const expected = ids(h({ method: 'GET', path: '/tickets', query: { sort } }));
    const got = [];
    let cursor;
    for (let n = 0; n < 20; n++) {
      const r = h({ method: 'GET', path: '/tickets', query: { sort, limit: '4', ...(cursor ? { cursor } : {}) } });
      assert.equal(r.status, 200);
      got.push(...ids(r));
      cursor = r.body.nextCursor;
      if (cursor === null) break;
      assert.equal(typeof cursor, 'string');
    }
    assert.deepEqual(got, expected);
  });
}
test('exact-fit last page has null cursor', () => {
  assert.equal(get({ limit: '23' }).body.nextCursor, null);
  assert.equal(get({ limit: '100' }).body.items.length, 23);
});
test('paging with filters', () => {
  const q = { status: 'open,resolved,closed,in_progress', assignee: 'none,binh,an,chi', sort: '-priority', limit: '2' };
  const r1 = get(q);
  const r2 = get({ ...q, cursor: r1.body.nextCursor });
  assert.equal(r2.status, 200);
  const all = ids(get({ ...q, limit: '100' }));
  assert.deepEqual([...ids(r1), ...ids(r2)], all.slice(0, 4));
});
test('validation errors', () => {
  const c = get({ limit: '2' }).body.nextCursor;
  const cases = [
    [{ status: 'bogus' }, 'status'], [{ status: 'open,' }, 'status'], [{ status: '' }, 'status'],
    [{ assignee: '' }, 'assignee'], [{ assignee: 'an,' }, 'assignee'],
    [{ sort: 'title' }, 'sort'], [{ sort: '--id' }, 'sort'], [{ sort: '' }, 'sort'],
    [{ limit: '0' }, 'limit'], [{ limit: '101' }, 'limit'], [{ limit: '1.5' }, 'limit'],
    [{ limit: 'abc' }, 'limit'], [{ limit: '' }, 'limit'], [{ limit: '-1' }, 'limit'],
    [{ cursor: c }, 'cursor'], [{ limit: '2', cursor: 'garbage!' }, 'cursor'],
    [{ limit: '2', cursor: 'e30' }, 'cursor'],
    [{ limit: '2', cursor: c, sort: '-id' }, 'cursor'],
    [{ limit: '2', cursor: c, status: 'open' }, 'cursor'],
    [{ limit: '2', cursor: c, assignee: 'an' }, 'cursor'],
  ];
  for (const [query, p] of cases) {
    const r = get(query);
    assert.equal(r.status, 400, JSON.stringify(query));
    assert.deepEqual(r.body, { error: `invalid_${p}` });
  }
});
