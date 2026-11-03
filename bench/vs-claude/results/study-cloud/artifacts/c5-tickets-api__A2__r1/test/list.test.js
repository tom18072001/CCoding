import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const ids = (b) => b.map((t) => t.id);

test('filters by status and assignee incl. none', () => {
  const r = get({ status: 'open,closed', assignee: 'none,an' });
  assert.equal(r.status, 200);
  assert.ok(r.body.length > 0);
  for (const t of r.body) {
    assert.ok(['open', 'closed'].includes(t.status));
    assert.ok(t.assignee === null || t.assignee === 'an');
  }
  assert.deepEqual(ids(r.body), [...ids(r.body)].sort((a, b) => a - b));
});
test('sort with tie-break by id ascending', () => {
  for (const s of ['priority', '-priority', 'createdAt', '-createdAt', '-id']) {
    const b = get({ sort: s }).body;
    const f = s.replace('-', ''), d = s[0] === '-' ? -1 : 1;
    for (let i = 1; i < b.length; i++) {
      const x = b[i - 1][f], y = b[i][f];
      assert.ok(d * (x < y ? -1 : x > y ? 1 : 0) < 0 || (x === y && b[i - 1].id < b[i].id), s);
    }
  }
});
test('pagination walks all items without dup, for every sort', () => {
  for (const sort of ['id', '-id', 'priority', '-priority', '-createdAt']) {
    const q = { status: 'open,in_progress,resolved', sort };
    const all = ids(get(q).body);
    const got = [];
    let cursor;
    for (let n = 0; n < 50; n++) {
      const r = get({ ...q, limit: '4', ...(cursor ? { cursor } : {}) });
      assert.equal(r.status, 200);
      got.push(...ids(r.body.items));
      cursor = r.body.nextCursor;
      if (cursor === null) break;
      assert.equal(typeof cursor, 'string');
    }
    assert.deepEqual(got, all);
  }
});
test('last page has null cursor when exactly full', () => {
  const r = get({ limit: '23' });
  assert.equal(r.body.items.length, 23);
  assert.equal(r.body.nextCursor, null);
});
test('validation errors', () => {
  const cur = get({ limit: '2' }).body.nextCursor;
  const cases = [
    [{ status: 'bogus' }, 'status'], [{ status: 'open,' }, 'status'],
    [{ sort: 'title' }, 'sort'], [{ sort: '--id' }, 'sort'],
    [{ limit: '0' }, 'limit'], [{ limit: '101' }, 'limit'], [{ limit: '1.5' }, 'limit'], [{ limit: 'abc' }, 'limit'], [{ limit: '' }, 'limit'],
    [{ cursor: cur }, 'cursor'], [{ limit: '2', cursor: 'garbage' }, 'cursor'],
    [{ limit: '2', cursor: cur, sort: 'priority' }, 'cursor'],
    [{ limit: '2', cursor: cur, status: 'open' }, 'cursor'],
    [{ limit: '2', cursor: cur, assignee: 'an' }, 'cursor'],
  ];
  for (const [q, p] of cases) {
    const r = get(q);
    assert.equal(r.status, 400, JSON.stringify(q));
    assert.deepEqual(r.body, { error: `invalid_${p}` });
  }
});
test('unknown params ignored; no params unchanged', () => {
  assert.deepEqual(get({ foo: 'bar' }).body, get({}).body);
  assert.ok(Array.isArray(get({ sort: '-id' }).body));
});
