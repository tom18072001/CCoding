import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed } from '../src/data.js';
const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const all = seed();

test('no params: bare array by id; unknown params ignored', () => {
  assert.deepEqual(get({}).body.map((t) => t.id), all.map((t) => t.id));
  assert.deepEqual(get({ foo: 'x' }).body.length, 23);
  assert.equal(createHandler()({ method: 'GET', path: '/tickets' }).body.length, 23);
});
test('status filter', () => {
  const r = get({ status: 'open,closed' });
  assert.deepEqual(r.body.map((t) => t.id), all.filter((t) => ['open', 'closed'].includes(t.status)).map((t) => t.id));
});
test('assignee filter incl none', () => {
  assert.ok(get({ assignee: 'none' }).body.every((t) => t.assignee === null));
  const r = get({ assignee: 'none,an' }).body;
  assert.deepEqual(r.map((t) => t.id), all.filter((t) => t.assignee === null || t.assignee === 'an').map((t) => t.id));
});
test('sort with id tie-break, both directions', () => {
  for (const f of ['priority', 'createdAt']) {
    const a = get({ sort: f }).body, d = get({ sort: '-' + f }).body;
    for (let i = 1; i < a.length; i++) {
      assert.ok(a[i - 1][f] < a[i][f] || (a[i - 1][f] === a[i][f] && a[i - 1].id < a[i].id));
      assert.ok(d[i - 1][f] > d[i][f] || (d[i - 1][f] === d[i][f] && d[i - 1].id < d[i].id));
    }
  }
  assert.equal(get({ sort: '-id' }).body[0].id, 23);
});
test('pagination walks everything exactly once', () => {
  for (const sort of ['id', '-priority', 'createdAt']) {
    const seen = [];
    let cursor, pages = 0;
    do {
      const q = { limit: '5', sort, status: 'open,in_progress,resolved,closed' };
      if (cursor) q.cursor = cursor;
      const r = get(q);
      assert.equal(r.status, 200);
      seen.push(...r.body.items.map((t) => t.id));
      cursor = r.body.nextCursor;
      pages++;
    } while (cursor);
    assert.deepEqual(seen, get({ sort }).body.map((t) => t.id));
    assert.equal(pages, 5);
  }
});
test('exact-fit last page has null cursor; limit shape', () => {
  const r = get({ limit: '23' });
  assert.equal(r.body.nextCursor, null);
  assert.equal(r.body.items.length, 23);
  assert.equal(get({ limit: '100' }).status, 200);
});
test('validation errors', () => {
  const c = get({ limit: '5' }).body.nextCursor;
  const cases = [
    [{ status: 'bogus' }, 'status'], [{ status: 'open,' }, 'status'], [{ status: '' }, 'status'],
    [{ assignee: 'an,' }, 'assignee'],
    [{ sort: 'title' }, 'sort'], [{ sort: '--id' }, 'sort'], [{ sort: '-' }, 'sort'],
    [{ limit: '0' }, 'limit'], [{ limit: '101' }, 'limit'], [{ limit: '1.5' }, 'limit'], [{ limit: 'abc' }, 'limit'], [{ limit: '-1' }, 'limit'], [{ limit: '' }, 'limit'],
    [{ cursor: c }, 'cursor'], [{ limit: '5', cursor: 'garbage' }, 'cursor'], [{ limit: '5', cursor: '' }, 'cursor'],
    [{ limit: '5', cursor: Buffer.from('{"b":"x"}').toString('base64url') }, 'cursor'],
    [{ limit: '5', cursor: c, sort: '-id' }, 'cursor'],
    [{ limit: '5', cursor: c, status: 'open' }, 'cursor'],
    [{ limit: '5', cursor: c, assignee: 'an' }, 'cursor'],
  ];
  for (const [q, p] of cases) {
    const r = get(q);
    assert.equal(r.status, 400, JSON.stringify(q));
    assert.deepEqual(r.body, { error: `invalid_${p}` }, JSON.stringify(q));
  }
  assert.equal(get({ limit: '5', cursor: c }).status, 200);
});
