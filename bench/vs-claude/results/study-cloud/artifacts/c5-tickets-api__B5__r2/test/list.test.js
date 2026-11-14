import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed } from '../src/data.js';

const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const all = seed();

test('no params: bare array by id', () => {
  const r = get({});
  assert.deepEqual(r.body.map((t) => t.id), all.map((t) => t.id));
});
test('status filter', () => {
  const r = get({ status: 'open,closed' });
  assert.ok(r.body.length > 0);
  assert.ok(r.body.every((t) => ['open', 'closed'].includes(t.status)));
  assert.equal(r.body.length, all.filter((t) => ['open', 'closed'].includes(t.status)).length);
});
test('assignee filter incl. none', () => {
  const r = get({ assignee: 'none,an' });
  assert.equal(r.body.length, all.filter((t) => t.assignee === null || t.assignee === 'an').length);
  assert.ok(get({ assignee: 'none' }).body.every((t) => t.assignee === null));
});
test('sort asc/desc with id tie-break', () => {
  for (const f of ['priority', 'createdAt']) {
    const a = get({ sort: f }).body;
    const d = get({ sort: '-' + f }).body;
    for (let i = 1; i < a.length; i++) {
      assert.ok(a[i - 1][f] < a[i][f] || (a[i - 1][f] === a[i][f] && a[i - 1].id < a[i].id));
      assert.ok(d[i - 1][f] > d[i][f] || (d[i - 1][f] === d[i][f] && d[i - 1].id < d[i].id));
    }
  }
  assert.equal(get({ sort: '-id' }).body[0].id, 23);
});
test('pagination walks everything exactly once for each sort', () => {
  for (const sort of ['id', '-id', 'priority', '-priority', 'createdAt', '-createdAt']) {
    const expected = get({ sort, status: 'open,resolved' }).body.map((t) => t.id);
    const got = [];
    let cursor;
    let pages = 0;
    do {
      const q = { sort, status: 'open,resolved', limit: '3' };
      if (cursor) q.cursor = cursor;
      const r = get(q);
      assert.equal(r.status, 200);
      assert.ok(r.body.items.length <= 3);
      got.push(...r.body.items.map((t) => t.id));
      cursor = r.body.nextCursor;
      pages++;
    } while (cursor);
    assert.deepEqual(got, expected, sort);
    assert.equal(pages, Math.ceil(expected.length / 3));
  }
});
test('exact fit last page has null cursor; empty result', () => {
  assert.equal(get({ limit: '100' }).body.nextCursor, null);
  const r = get({ limit: '5', assignee: 'zzz' });
  assert.deepEqual(r.body, { items: [], nextCursor: null });
});
test('validation errors', () => {
  const cur = get({ limit: '2' }).body.nextCursor;
  const cases = [
    [{ status: 'bogus' }, 'status'], [{ status: 'open,' }, 'status'], [{ status: '' }, 'status'],
    [{ sort: 'title' }, 'sort'], [{ sort: '--id' }, 'sort'], [{ sort: '' }, 'sort'],
    [{ limit: '0' }, 'limit'], [{ limit: '101' }, 'limit'], [{ limit: '1.5' }, 'limit'], [{ limit: 'abc' }, 'limit'], [{ limit: '-1' }, 'limit'], [{ limit: '' }, 'limit'],
    [{ cursor: cur }, 'cursor'], [{ limit: '2', cursor: 'garbage!' }, 'cursor'], [{ limit: '2', cursor: 'e30' }, 'cursor'],
    [{ limit: '2', cursor: cur, sort: '-id' }, 'cursor'], [{ limit: '2', cursor: cur, status: 'open' }, 'cursor'], [{ limit: '2', cursor: cur, assignee: 'an' }, 'cursor'],
  ];
  for (const [q, p] of cases) {
    const r = get(q);
    assert.equal(r.status, 400, JSON.stringify(q));
    assert.deepEqual(r.body, { error: `invalid_${p}` });
  }
});
test('unknown params ignored; cursor valid with same params', () => {
  assert.equal(get({ foo: 'bar' }).body.length, 23);
  const q = { limit: '2', sort: '-priority', foo: 'x' };
  const c = get(q).body.nextCursor;
  assert.equal(get({ ...q, cursor: c }).status, 200);
});
