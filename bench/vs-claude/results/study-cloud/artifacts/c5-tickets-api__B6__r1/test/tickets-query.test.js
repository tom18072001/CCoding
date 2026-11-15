import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed, STATUSES } from '../src/data.js';

const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const ids = (rows) => rows.map((t) => t.id);

// Expected results computed independently from seed().
function expected({ status, assignee, field = 'id', desc = false } = {}) {
  const st = status && status.split(',');
  const as = assignee && assignee.split(',');
  const rows = seed().filter(
    (t) => (!st || st.includes(t.status)) && (!as || as.includes(t.assignee ?? 'none')),
  );
  const key = (t) => t[field];
  rows.sort((a, b) => {
    if (key(a) !== key(b)) return (key(a) < key(b) ? -1 : 1) * (desc ? -1 : 1);
    return a.id - b.id;
  });
  return rows;
}

function walk(query) {
  const all = [];
  let cursor;
  let pages = 0;
  do {
    const q = { ...query, ...(cursor ? { cursor } : {}) };
    const r = get(q);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.items));
    assert.ok(r.body.nextCursor === null || typeof r.body.nextCursor === 'string');
    all.push(...r.body.items);
    cursor = r.body.nextCursor;
    assert.ok(++pages < 100, 'pagination does not terminate');
  } while (cursor !== null);
  return all;
}

test('no params: bare array sorted by id', () => {
  const r = get({});
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
  assert.deepEqual(r.body, expected());
  assert.deepEqual(ids(r.body), seed().map((t) => t.id).sort((a, b) => a - b));
});

test('unknown query params ignored', () => {
  assert.deepEqual(get({ foo: 'bar', x: '1' }).body, expected());
});

test('status filter: single, multiple, invalid', () => {
  for (const s of STATUSES) {
    const r = get({ status: s });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, expected({ status: s }));
  }
  assert.deepEqual(get({ status: 'open,closed' }).body, expected({ status: 'open,closed' }));
  for (const bad of ['bogus', 'open,bogus', 'OPEN', '']) {
    assert.deepEqual(get({ status: bad }), { status: 400, body: { error: 'invalid_status' } }, bad);
  }
});

test('assignee filter: name, none, combination', () => {
  assert.deepEqual(get({ assignee: 'binh' }).body, expected({ assignee: 'binh' }));
  const none = get({ assignee: 'none' });
  assert.deepEqual(none.body, expected({ assignee: 'none' }));
  assert.ok(none.body.length > 0 && none.body.every((t) => t.assignee === null));
  assert.deepEqual(get({ assignee: 'an,none' }).body, expected({ assignee: 'an,none' }));
  assert.deepEqual(get({ assignee: 'nobody' }).body, []);
});

test('status + assignee combined', () => {
  const q = { status: 'open,resolved', assignee: 'an,none' };
  assert.deepEqual(get(q).body, expected(q));
});

test('sort variants with id tie-break ascending', () => {
  const cases = [
    ['priority', 'priority', false],
    ['-priority', 'priority', true],
    ['createdAt', 'createdAt', false],
    ['-createdAt', 'createdAt', true],
    ['id', 'id', false],
    ['-id', 'id', true],
  ];
  for (const [sort, field, desc] of cases) {
    const r = get({ sort });
    assert.equal(r.status, 200, sort);
    assert.deepEqual(r.body, expected({ field, desc }), sort);
  }
  const d = get({ sort: '-priority' }).body;
  assert.ok(d.some((t, i) => i && d[i - 1].priority === t.priority), 'seed has priority ties');
  for (let i = 1; i < d.length; i++) {
    if (d[i - 1].priority === d[i].priority) assert.ok(d[i - 1].id < d[i].id);
  }
});

test('sort combined with filter, bare array', () => {
  const q = { status: 'open,in_progress', sort: '-priority' };
  assert.deepEqual(get(q).body, expected({ status: q.status, field: 'priority', desc: true }));
});

test('invalid sort', () => {
  for (const s of ['title', '--id', '-', '', 'ID', 'status']) {
    assert.deepEqual(get({ sort: s }), { status: 400, body: { error: 'invalid_sort' } }, s);
  }
});

test('limit validation', () => {
  for (const l of ['0', '101', 'abc', '1.5', '-1', '']) {
    assert.deepEqual(get({ limit: l }), { status: 400, body: { error: 'invalid_limit' } }, JSON.stringify(l));
  }
  for (const l of ['1', '100']) {
    const r = get({ limit: l });
    assert.equal(r.status, 200);
    assert.ok(!Array.isArray(r.body));
    assert.ok(r.body.items.length <= Number(l));
  }
  const one = get({ limit: '1' }).body;
  assert.equal(one.items.length, 1);
  assert.equal(typeof one.nextCursor, 'string');
  assert.deepEqual(get({ limit: '100' }).body, { items: expected(), nextCursor: null });
});

const sorts = ['id', '-id', 'priority', '-priority', 'createdAt', '-createdAt'];
const filters = [
  {},
  { status: 'open,in_progress' },
  { assignee: 'an,none' },
  { status: 'closed,resolved', assignee: 'binh,chi,none' },
];

test('paging walks equal unpaginated result for all sorts, filters, limits', () => {
  for (const sort of sorts) {
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;
    for (const f of filters) {
      const want = expected({ ...f, field, desc });
      for (const limit of ['1', '2', '5', '7', '100']) {
        const got = walk({ ...f, sort, limit });
        assert.deepEqual(got, want, `${sort} ${JSON.stringify(f)} limit=${limit}`);
        assert.equal(new Set(ids(got)).size, got.length);
      }
    }
  }
});

test('exact page boundary: last page has nextCursor null', () => {
  const total = expected().length;
  assert.equal(get({ limit: String(total) }).body.nextCursor, null);
  const r2 = get({ limit: String(total - 1) });
  assert.notEqual(r2.body.nextCursor, null);
  const last = get({ limit: String(total - 1), cursor: r2.body.nextCursor });
  assert.equal(last.body.items.length, 1);
  assert.equal(last.body.nextCursor, null);
});

test('empty result set', () => {
  const r = get({ assignee: 'nobody', limit: '5' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { items: [], nextCursor: null });
});

test('invalid cursors', () => {
  const err = { status: 400, body: { error: 'invalid_cursor' } };
  for (const c of ['garbage', '!!!', 'e30', Buffer.from('not json').toString('base64url'), '']) {
    assert.deepEqual(get({ limit: '5', cursor: c }), err, JSON.stringify(c));
  }
  const issued = { limit: '5', status: 'open,closed', assignee: 'an,none', sort: 'priority' };
  const cur = get(issued).body.nextCursor;
  assert.equal(typeof cur, 'string');
  const base = { ...issued, cursor: cur };
  assert.equal(get(base).status, 200);
  assert.deepEqual(get({ ...base, status: 'open' }), err);
  assert.deepEqual(get({ ...base, assignee: 'an' }), err);
  assert.deepEqual(get({ ...base, sort: '-priority' }), err);
  const { sort, status, ...fewer } = base;
  assert.deepEqual(get(fewer), err);
  const { limit, ...noLimit } = base;
  assert.deepEqual(get(noLimit), err);
  assert.deepEqual(get({ cursor: cur }), err);
});

test('error responses have status 400 and exact body shape', () => {
  const r = get({ limit: '0' });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.body), ['error']);
  assert.equal(r.body.error, 'invalid_limit');
});
