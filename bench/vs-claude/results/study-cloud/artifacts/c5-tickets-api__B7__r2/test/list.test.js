import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const ids = (b) => (Array.isArray(b) ? b : b.items).map((t) => t.id);

test('no params: bare array by id', () => {
  const r = get({});
  assert.ok(Array.isArray(r.body));
  assert.deepEqual(ids(r.body), [...Array(23)].map((_, i) => i + 1));
});
test('status filter', () => {
  const r = get({ status: 'open,closed' });
  assert.ok(r.body.length > 0);
  assert.ok(r.body.every((t) => ['open', 'closed'].includes(t.status)));
});
test('assignee filter incl. none', () => {
  const r = get({ assignee: 'none,an' });
  assert.ok(r.body.every((t) => t.assignee === null || t.assignee === 'an'));
  assert.deepEqual(ids(get({ assignee: 'none' }).body), [5, 10, 15, 20]);
});
test('sort with id tie-break, both directions', () => {
  for (const f of ['priority', 'createdAt']) {
    for (const d of [1, -1]) {
      const b = get({ sort: (d < 0 ? '-' : '') + f }).body;
      for (let i = 1; i < b.length; i++) {
        const p = b[i - 1], c = b[i];
        if (p[f] === c[f]) assert.ok(p.id < c.id);
        else assert.ok(d * (p[f] < c[f] ? -1 : 1) < 0);
      }
    }
  }
  assert.equal(get({ sort: '-id' }).body[0].id, 23);
});
test('pagination walks all pages without gaps/dupes', () => {
  for (const sort of ['id', '-id', 'priority', '-priority', 'createdAt', '-createdAt']) {
    const q = { sort, status: 'open,in_progress,resolved', limit: '4' };
    const expected = ids(get({ sort, status: q.status }).body);
    const got = [];
    let cursor;
    for (let n = 0; n < 20; n++) {
      const r = get(cursor ? { ...q, cursor } : q);
      assert.equal(r.status, 200);
      got.push(...ids(r.body));
      cursor = r.body.nextCursor;
      if (cursor === null) break;
      assert.equal(typeof cursor, 'string');
    }
    assert.deepEqual(got, expected);
  }
});
test('exact multiple of limit ends with null cursor', () => {
  assert.equal(get({ limit: '23' }).body.nextCursor, null);
  assert.equal(get({ limit: '100' }).body.items.length, 23);
});
test('validation errors', () => {
  const e = (q, p) => { const r = get(q); assert.equal(r.status, 400); assert.deepEqual(r.body, { error: `invalid_${p}` }); };
  e({ status: 'open,bogus' }, 'status');
  e({ status: '' }, 'status');
  e({ sort: 'title' }, 'sort');
  e({ sort: '--id' }, 'sort');
  for (const l of ['0', '101', '1.5', 'abc', '', '-1']) e({ limit: l }, 'limit');
  e({ cursor: 'abc' }, 'cursor');
  e({ limit: '2', cursor: '!!!' }, 'cursor');
  e({ limit: '2', cursor: Buffer.from('{}').toString('base64url') }, 'cursor');
  const c = get({ limit: '2' }).body.nextCursor;
  e({ cursor: c }, 'cursor');
});
test('cursor mismatch and unknown params', () => {
  const c = get({ limit: '2', sort: 'priority' }).body.nextCursor;
  assert.equal(get({ limit: '2', sort: 'priority', cursor: c, foo: 'x' }).status, 200);
  for (const other of [{ sort: '-priority' }, { sort: 'id' }, { sort: 'priority', status: 'open' }, { sort: 'priority', assignee: 'an' }, {}]) {
    const r = get({ limit: '2', cursor: c, ...other });
    assert.deepEqual([r.status, r.body], [400, { error: 'invalid_cursor' }]);
  }
});
