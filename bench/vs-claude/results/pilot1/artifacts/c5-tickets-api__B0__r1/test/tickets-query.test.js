import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed, STATUSES } from '../src/data.js';

const all = seed();
const get = (query, tickets) => createHandler(tickets)({ method: 'GET', path: '/tickets', query });
const ids = (l) => l.map((t) => t.id);
const byId = (a, b) => a.id - b.id;
const asc = (f) => (a, b) => (a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : a.id - b.id);
const desc = (f) => (a, b) => (a[f] < b[f] ? 1 : a[f] > b[f] ? -1 : a.id - b.id);
const err = (r, p) => {
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: `invalid_${p}` });
};

// fixture nhỏ có giá trị trùng (priority, createdAt), không sắp theo id
const fx = [
  { id: 5, title: 'e', status: 'open', assignee: 'an', priority: 2, createdAt: '2026-10-02T00:00:00Z' },
  { id: 2, title: 'b', status: 'closed', assignee: null, priority: 1, createdAt: '2026-10-03T00:00:00Z' },
  { id: 4, title: 'd', status: 'open', assignee: 'binh', priority: 2, createdAt: '2026-10-02T00:00:00Z' },
  { id: 1, title: 'a', status: 'resolved', assignee: 'an', priority: 1, createdAt: '2026-10-03T00:00:00Z' },
  { id: 3, title: 'c', status: 'open', assignee: null, priority: 3, createdAt: '2026-10-01T00:00:00Z' },
];

function pageAll(query, limit, tickets) {
  const out = [];
  let cursor;
  for (let n = 0; n < 200; n++) {
    const q = { ...query, limit: String(limit) };
    if (cursor) q.cursor = cursor;
    const r = get(q, tickets);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ['items', 'nextCursor']);
    out.push(...r.body.items);
    if (r.body.nextCursor === null) return out;
    assert.equal(typeof r.body.nextCursor, 'string');
    cursor = r.body.nextCursor;
  }
  assert.fail('pagination did not terminate');
}

test('(a) backward compat: no query / undefined / unknown params', () => {
  for (const q of [{}, undefined, { foo: 'bar', page: '2' }]) {
    const r = get(q);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
    assert.equal(r.body.length, 23);
    assert.deepEqual(ids(r.body), [...all].sort(byId).map((t) => t.id));
  }
  assert.deepEqual(get({ foo: '1', status: 'open' }).body, get({ status: 'open' }).body);
});

test('(b) status filter', () => {
  assert.deepEqual(ids(get({ status: 'open' }).body), ids(all.filter((t) => t.status === 'open')));
  const r = get({ status: 'open,closed' });
  assert.deepEqual(ids(r.body), ids(all.filter((t) => ['open', 'closed'].includes(t.status))));
  assert.deepEqual(ids(get({ status: STATUSES.join(',') }).body), ids(all));
  for (const s of ['bogus', '', 'open,', 'open,bogus', ',open', 'OPEN']) err(get({ status: s }), 'status');
});

test('(c) assignee filter', () => {
  assert.deepEqual(ids(get({ assignee: 'an' }).body), ids(all.filter((t) => t.assignee === 'an')));
  assert.deepEqual(ids(get({ assignee: 'none' }).body), ids(all.filter((t) => t.assignee === null)));
  assert.deepEqual(
    ids(get({ assignee: 'an,none' }).body),
    ids(all.filter((t) => t.assignee === null || t.assignee === 'an')),
  );
  assert.deepEqual(get({ assignee: 'nobody' }).body, []);
  assert.deepEqual(
    ids(get({ assignee: 'none', status: 'open,closed' }).body),
    ids(all.filter((t) => t.assignee === null && ['open', 'closed'].includes(t.status))),
  );
  assert.deepEqual(ids(get({ assignee: 'none' }, fx).body), [2, 3]);
});

test('(d) sort with ties broken by id asc', () => {
  for (const f of ['id', 'priority', 'createdAt']) {
    for (const [prefix, cmpf] of [['', asc], ['-', desc]]) {
      const exp = (src) => ids([...src].sort(cmpf(f)));
      assert.deepEqual(ids(get({ sort: prefix + f }).body), exp(all), prefix + f);
      assert.deepEqual(ids(get({ sort: prefix + f }, fx).body), exp(fx), `fx ${prefix}${f}`);
    }
  }
  assert.deepEqual(ids(get({ sort: '-priority' }, fx).body), [3, 4, 5, 1, 2]);
  assert.deepEqual(ids(get({ sort: 'priority' }, fx).body), [1, 2, 4, 5, 3]);
  assert.deepEqual(ids(get({ sort: '-id' }).body), ids(all).reverse());
  assert.deepEqual(ids(get({}, fx).body), [1, 2, 3, 4, 5]);
  for (const s of ['title', '--id', '', '-', 'ID', 'id,priority']) err(get({ sort: s }), 'sort');
});

test('(e) limit validation', () => {
  for (const l of ['0', '101', 'abc', '1.5', '', '-1', '1e1', ' 5', '10.0', '+5']) err(get({ limit: l }), 'limit');
  for (const l of ['1', '100']) {
    const r = get({ limit: l });
    assert.equal(r.status, 200);
    assert.ok(!Array.isArray(r.body));
    assert.ok(Array.isArray(r.body.items));
    assert.ok('nextCursor' in r.body);
  }
  assert.equal(get({ limit: '1' }).body.items.length, 1);
  assert.equal(get({ limit: '100' }).body.nextCursor, null);
});

test('(f) pagination reassembles to unpaginated result', () => {
  const variants = [
    {}, { sort: '-priority' }, { sort: 'createdAt' }, { sort: '-createdAt' }, { sort: 'priority' }, { sort: '-id' },
    { status: 'open,closed' }, { assignee: 'none', sort: '-createdAt' },
    { status: 'open,in_progress,resolved', assignee: 'an,none', sort: 'priority' },
  ];
  for (const q of variants) {
    const expected = get(q).body;
    for (const limit of [1, 5, 23, 100]) {
      assert.deepEqual(pageAll(q, limit), expected, `${JSON.stringify(q)} limit ${limit}`);
    }
  }
  for (const q of [{}, { sort: '-priority' }, { sort: 'createdAt' }]) {
    for (const limit of [1, 2, 3]) assert.deepEqual(pageAll(q, limit, fx), get(q, fx).body);
  }
});

test('(f) last page nextCursor null, including exact multiples', () => {
  const r = get({ limit: '23' });
  assert.equal(r.body.items.length, 23);
  assert.equal(r.body.nextCursor, null);
  assert.notEqual(get({ limit: '5' }).body.nextCursor, null);
  assert.equal(get({ limit: '5' }, fx).body.nextCursor, null);
  assert.deepEqual(get({ limit: '1', status: 'resolved' }, fx).body, { items: [fx[3]], nextCursor: null });
  assert.deepEqual(get({ limit: '10', assignee: 'nobody' }).body, { items: [], nextCursor: null });
  // 4 open tickets, limit 2 -> exactly 2 pages, last page null
  const four = fx.concat([{ ...fx[0], id: 9 }]);
  const a = get({ limit: '2', status: 'open' }, four);
  const b = get({ limit: '2', status: 'open', cursor: a.body.nextCursor }, four);
  assert.equal(a.body.items.length, 2);
  assert.notEqual(a.body.nextCursor, null);
  assert.equal(b.body.items.length, 2);
  assert.equal(b.body.nextCursor, null);
});

test('(g) cursor validation', () => {
  const base = { limit: '3', status: 'open', assignee: 'an,none', sort: '-priority' };
  const c = get(base).body.nextCursor;
  assert.equal(typeof c, 'string');
  assert.equal(get({ ...base, cursor: c }).status, 200);
  const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  const junk = ['garbage', '!!!', 'a.b', '', b64('not json'), b64({}), b64([]), b64({ v: 1 }),
    b64({ v: 1, f: 'x', k: [1, 2] }), b64('null'), b64(5)];
  for (const bad of junk) err(get({ ...base, cursor: bad }), 'cursor');
  // mismatched params
  err(get({ ...base, cursor: c, status: 'closed' }), 'cursor');
  err(get({ ...base, cursor: c, status: 'open,closed' }), 'cursor');
  err(get({ ...base, cursor: c, assignee: 'an' }), 'cursor');
  err(get({ ...base, cursor: c, sort: 'priority' }), 'cursor');
  err(get({ ...base, cursor: c, sort: 'id' }), 'cursor');
  const noStatus = { ...base };
  delete noStatus.status;
  err(get({ ...noStatus, cursor: c }), 'cursor');
  const d = get({ limit: '3' }).body.nextCursor;
  err(get({ limit: '3', sort: '-id', cursor: d }), 'cursor');
  // no limit
  err(get({ cursor: c }), 'cursor');
  // different limit still valid and continues correctly
  const expected = get({ status: 'open', assignee: 'an,none', sort: '-priority' }).body;
  const r = get({ ...base, limit: '2', cursor: c });
  assert.equal(r.status, 200);
  assert.deepEqual(ids(r.body.items), ids(expected.slice(3, 5)));
  // equivalent filter spellings share the same fingerprint
  const e = get({ limit: '3', status: 'open,closed' }).body.nextCursor;
  assert.equal(get({ limit: '3', status: 'closed,open', cursor: e }).status, 200);
  assert.equal(get({ limit: '3', sort: 'id', cursor: d }).status, 200);
});

test('(h) error precedence status > assignee > sort > limit > cursor', () => {
  const q = { status: 'x', assignee: '', sort: 'bad', limit: '0', cursor: 'junk' };
  err(get(q), 'status');
  delete q.status;
  err(get(q), 'assignee');
  delete q.assignee;
  err(get(q), 'sort');
  delete q.sort;
  err(get(q), 'limit');
  delete q.limit;
  err(get(q), 'cursor');
});
