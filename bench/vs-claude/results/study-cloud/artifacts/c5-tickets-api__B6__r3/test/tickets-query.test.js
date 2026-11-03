import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed, STATUSES } from '../src/data.js';

const all = seed();
const get = (query, h = createHandler()) => h({ method: 'GET', path: '/tickets', query });
const ids = (a) => a.map((t) => t.id);

const byId = (a, b) => a.id - b.id;
function expected({ status, assignee, sort = 'id' } = {}) {
  const st = status ? status.split(',') : null;
  const as = assignee ? assignee.split(',') : null;
  const desc = sort.startsWith('-');
  const f = desc ? sort.slice(1) : sort;
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  return seed()
    .filter((t) => (!st || st.includes(t.status)) && (!as || as.includes(t.assignee === null ? 'none' : t.assignee)))
    .sort((a, b) => (desc ? -1 : 1) * cmp(a[f], b[f]) || byId(a, b));
}

const SORTS = ['id', '-id', 'priority', '-priority', 'createdAt', '-createdAt'];

test('no params: bare array sorted by id', () => {
  const r = get({});
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
  assert.deepEqual(r.body, all.slice().sort(byId));
});

test('missing query object behaves like no params', () => {
  const r = createHandler()({ method: 'GET', path: '/tickets' });
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 23);
});

test('status: single and multiple values', () => {
  for (const s of STATUSES) {
    const r = get({ status: s });
    assert.equal(r.status, 200);
    assert.ok(r.body.length > 0);
    assert.deepEqual(r.body, expected({ status: s }));
    assert.ok(r.body.every((t) => t.status === s));
  }
  const r = get({ status: 'open,closed' });
  assert.deepEqual(r.body, expected({ status: 'open,closed' }));
  assert.ok(r.body.some((t) => t.status === 'open') && r.body.some((t) => t.status === 'closed'));
});

test('assignee: name, none, and mixed', () => {
  let r = get({ assignee: 'an' });
  assert.deepEqual(r.body, expected({ assignee: 'an' }));
  assert.ok(r.body.length > 0 && r.body.every((t) => t.assignee === 'an'));
  r = get({ assignee: 'none' });
  assert.deepEqual(r.body, expected({ assignee: 'none' }));
  assert.ok(r.body.length > 0 && r.body.every((t) => t.assignee === null));
  r = get({ assignee: 'an,none' });
  assert.deepEqual(r.body, expected({ assignee: 'an,none' }));
  assert.ok(r.body.some((t) => t.assignee === null) && r.body.some((t) => t.assignee === 'an'));
  r = get({ assignee: 'nobody' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, []);
});

for (const sort of SORTS) {
  test(`sort=${sort} with id tie-break ascending`, () => {
    const r = get({ sort });
    assert.equal(r.status, 200);
    assert.deepEqual(ids(r.body), ids(expected({ sort })));
  });
}

test('seed has priority ties (tie-break tests are meaningful)', () => {
  // createdAt values are unique in seed(); only priority has ties.
  assert.ok(new Set(all.map((t) => t.priority)).size < all.length);
});

test('filter + sort without limit returns bare array', () => {
  for (const sort of SORTS) {
    const q = { status: 'open,in_progress,resolved', assignee: 'an,binh,none', sort };
    const r = get(q);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
    assert.deepEqual(ids(r.body), ids(expected(q)));
  }
});

function walk(query, limit, h = createHandler()) {
  const out = [];
  let cursor;
  for (let n = 0; n < 200; n++) {
    const q = { ...query, limit: String(limit) };
    if (cursor !== undefined) q.cursor = cursor;
    const r = get(q, h);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ['items', 'nextCursor']);
    assert.ok(r.body.items.length <= limit);
    out.push(...r.body.items);
    if (r.body.nextCursor === null) return out;
    assert.equal(typeof r.body.nextCursor, 'string');
    assert.ok(r.body.items.length > 0);
    cursor = r.body.nextCursor;
  }
  assert.fail('pagination did not terminate');
}

for (const sort of SORTS) {
  for (const limit of [1, 5, 7, 100]) {
    test(`pagination sort=${sort} limit=${limit} equals unpaginated`, () => {
      const want = ids(get({ sort }).body);
      const got = walk({ sort }, limit);
      assert.deepEqual(ids(got), want);
      assert.equal(new Set(ids(got)).size, got.length);
    });
    test(`pagination with filters sort=${sort} limit=${limit}`, () => {
      const q = { status: 'open,resolved,closed', assignee: 'an,chi,none', sort };
      assert.deepEqual(ids(walk(q, limit)), ids(expected(q)));
    });
  }
}

test('limit=100 returns single page with nextCursor null', () => {
  const r = get({ limit: '100' });
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 23);
  assert.equal(r.body.nextCursor, null);
});

test('last page has nextCursor null; exact multiple boundary', () => {
  const r = get({ limit: '23' });
  assert.equal(r.body.items.length, 23);
  assert.equal(r.body.nextCursor, null);
  const p = get({ limit: '22' });
  assert.notEqual(p.body.nextCursor, null);
  const last = get({ limit: '22', cursor: p.body.nextCursor });
  assert.equal(last.body.items.length, 1);
  assert.equal(last.body.nextCursor, null);
});

test('empty filter result with limit', () => {
  const r = get({ assignee: 'nobody', limit: '5' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { items: [], nextCursor: null });
});

test('cursor works with the same filters and sort', () => {
  const q = { status: 'open,in_progress', assignee: 'an,binh,chi,dung', sort: '-priority', limit: '3' };
  const p1 = get(q);
  assert.notEqual(p1.body.nextCursor, null);
  const p2 = get({ ...q, cursor: p1.body.nextCursor });
  assert.equal(p2.status, 200);
  const want = ids(expected(q));
  assert.deepEqual(ids([...p1.body.items, ...p2.body.items]), want.slice(0, 6));
});

test('cursor rejected when status, assignee or sort changes', () => {
  const base = { status: 'open,in_progress', assignee: 'an,binh,chi,dung', sort: 'priority', limit: '2' };
  const cursor = get(base).body.nextCursor;
  assert.equal(typeof cursor, 'string');
  assert.equal(get({ ...base, cursor }).status, 200);
  const variants = [
    { status: 'closed' },
    { status: undefined },
    { assignee: 'an' },
    { assignee: undefined },
    { sort: '-priority' },
    { sort: 'id' },
    { sort: undefined },
  ];
  for (const v of variants) {
    const q = { ...base, cursor };
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) delete q[k];
      else q[k] = val;
    }
    const r = get(q);
    assert.equal(r.status, 400, JSON.stringify(v));
    assert.deepEqual(r.body, { error: 'invalid_cursor' }, JSON.stringify(v));
  }
});

test('cursor issued without filters rejected when a filter is added', () => {
  const cursor = get({ limit: '2' }).body.nextCursor;
  const r = get({ limit: '2', cursor, status: 'open' });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: 'invalid_cursor' });
});

test('400 for invalid status (incl. one bad value in a list)', () => {
  for (const status of ['bogus', 'open,bogus', 'bogus,open', 'OPEN']) {
    const r = get({ status });
    assert.equal(r.status, 400, status);
    assert.deepEqual(r.body, { error: 'invalid_status' });
  }
});

test('400 for invalid sort', () => {
  for (const sort of ['title', '-title', 'ID', '--id', '', '-', 'status']) {
    const r = get({ sort });
    assert.equal(r.status, 400, sort);
    assert.deepEqual(r.body, { error: 'invalid_sort' });
  }
});

test('400 for invalid limit', () => {
  for (const limit of ['0', '101', 'abc', '1.5', '-1', '']) {
    const r = get({ limit });
    assert.equal(r.status, 400, JSON.stringify(limit));
    assert.deepEqual(r.body, { error: 'invalid_limit' });
  }
});

test('400 for garbage cursor', () => {
  for (const cursor of ['garbage', '!!!', 'abc.def', '%%%', 'e30', 'bnVsbA']) {
    const r = get({ limit: '5', cursor });
    assert.equal(r.status, 400, cursor);
    assert.deepEqual(r.body, { error: 'invalid_cursor' });
  }
});

test('400 for cursor without limit', () => {
  const cursor = get({ limit: '2' }).body.nextCursor;
  const r = get({ cursor });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: 'invalid_cursor' });
});

test('unknown query params are ignored', () => {
  assert.deepEqual(get({ foo: 'bar', page: '2', x: '' }).body, all.slice().sort(byId));
  const r = get({ limit: '3', foo: 'bar' });
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 3);
});

test('does not mutate the source tickets array', () => {
  const tickets = seed();
  const snapshot = JSON.stringify(tickets);
  const h = createHandler(tickets);
  for (const sort of SORTS) {
    get({ sort, status: 'open,closed' }, h);
    walk({ sort }, 5, h);
  }
  assert.equal(JSON.stringify(tickets), snapshot);
});
