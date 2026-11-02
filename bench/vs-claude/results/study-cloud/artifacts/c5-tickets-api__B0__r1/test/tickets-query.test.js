import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed, STATUSES } from '../src/data.js';

const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const ids = (list) => list.map((t) => t.id);
const all = seed();
const byId = (a, b) => a.id - b.id;
const expectSorted = (list, field, dir) => [...list].sort((a, b) => {
  if (a[field] !== b[field]) return (a[field] < b[field] ? -1 : 1) * dir;
  return a.id - b.id;
});
const assert400 = (query, param) => {
  const r = get(query);
  assert.equal(r.status, 400, JSON.stringify(query));
  assert.deepEqual(r.body, { error: `invalid_${param}` }, JSON.stringify(query));
};
function pages(query, limit) {
  const out = [];
  let cursor;
  for (let n = 0; n < 100; n++) {
    const q = { ...query, limit: String(limit) };
    if (cursor !== undefined) q.cursor = cursor;
    const r = get(q);
    assert.equal(r.status, 200);
    assert.ok(r.body.items.length <= limit);
    out.push(...r.body.items);
    if (r.body.nextCursor === null) return out;
    assert.equal(typeof r.body.nextCursor, 'string');
    cursor = r.body.nextCursor;
  }
  assert.fail('pagination did not terminate');
}

test('backward compat: {} and undefined query give bare array sorted by id', () => {
  for (const q of [{}, undefined]) {
    const r = get(q);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
    assert.deepEqual(r.body, [...all].sort(byId));
  }
});

test('filter/sort without limit still returns a bare array', () => {
  const r = get({ status: 'open', sort: '-priority' });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
});

test('status filter: single and multiple', () => {
  assert.deepEqual(get({ status: 'open' }).body, all.filter((t) => t.status === 'open'));
  const r = get({ status: 'open,closed' }).body;
  assert.deepEqual(r, all.filter((t) => ['open', 'closed'].includes(t.status)));
  assert.ok(r.length > 0);
  assert.deepEqual(get({ status: STATUSES.join(',') }).body, all);
});

test('assignee filter: name, none, combination', () => {
  assert.deepEqual(get({ assignee: 'an' }).body, all.filter((t) => t.assignee === 'an'));
  const none = get({ assignee: 'none' }).body;
  assert.deepEqual(none, all.filter((t) => t.assignee === null));
  assert.ok(none.length > 0);
  assert.deepEqual(get({ assignee: 'none,an' }).body, all.filter((t) => t.assignee === null || t.assignee === 'an'));
  assert.deepEqual(get({ assignee: 'nobody' }).body, []);
});

test('status and assignee combine with AND', () => {
  assert.deepEqual(
    get({ status: 'open,closed', assignee: 'none,an' }).body,
    all.filter((t) => ['open', 'closed'].includes(t.status) && (t.assignee === null || t.assignee === 'an')),
  );
});

test('sort fields, both directions, id tiebreak ascending', () => {
  for (const field of ['id', 'priority', 'createdAt']) {
    for (const dir of [1, -1]) {
      const sort = (dir === -1 ? '-' : '') + field;
      assert.deepEqual(ids(get({ sort }).body), ids(expectSorted(all, field, dir)), sort);
    }
  }
  // priority has ties in the seed: tie order must be id ascending in both directions
  for (const sort of ['priority', '-priority']) {
    const l = get({ sort }).body;
    let ties = 0;
    for (let i = 1; i < l.length; i++) {
      if (l[i].priority === l[i - 1].priority) { ties++; assert.ok(l[i].id > l[i - 1].id, sort); }
    }
    assert.ok(ties > 0);
  }
});

test('pagination concatenation equals unpaginated result', () => {
  const cases = [{}, { sort: '-priority' }, { sort: 'createdAt' }, { sort: '-createdAt' }, { sort: '-id' },
    { status: 'open,in_progress,closed', sort: '-priority' }, { assignee: 'none,an', sort: '-createdAt' }];
  for (const q of cases) {
    assert.deepEqual(pages(q, 5), get(q).body, JSON.stringify(q));
  }
});

test('pagination: limit=1, limit=100, last page cursor null, page sizes', () => {
  assert.deepEqual(pages({}, 1), [...all].sort(byId));
  const r = get({ limit: '100' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { items: [...all].sort(byId), nextCursor: null });
  const first = get({ limit: '5' }).body;
  assert.equal(first.items.length, 5);
  assert.notEqual(first.nextCursor, null);
  assert.equal(get({ limit: String(all.length) }).body.nextCursor, null);
  assert.deepEqual(get({ assignee: 'nobody', limit: '5' }).body, { items: [], nextCursor: null });
});

test('invalid_status', () => {
  for (const status of ['bogus', '', 'open,bogus', 'OPEN']) assert400({ status }, 'status');
});

test('invalid_sort', () => {
  for (const sort of ['title', '--id', '', '-', 'ID']) assert400({ sort }, 'sort');
});

test('invalid_limit', () => {
  for (const limit of ['0', '101', '1.5', 'abc', '', '-1']) assert400({ limit }, 'limit');
});

test('invalid_cursor', () => {
  assert400({ limit: '5', cursor: 'garbage!!' }, 'cursor');
  assert400({ limit: '5', cursor: '' }, 'cursor');
  assert400({ limit: '5', cursor: Buffer.from('not json').toString('base64url') }, 'cursor');
  assert400({ limit: '5', cursor: Buffer.from('{}').toString('base64url') }, 'cursor');
  const c = get({ limit: '5' }).body.nextCursor;
  assert400({ cursor: c }, 'cursor'); // cursor without limit
});

test('cursor bound to status/assignee/sort', () => {
  const base = { status: 'open,closed', assignee: 'none,an', sort: 'priority' };
  const c = get({ ...base, limit: '2' }).body.nextCursor;
  assert.equal(typeof c, 'string');
  assert.equal(get({ ...base, limit: '2', cursor: c }).status, 200);
  assert400({ ...base, status: 'open', limit: '2', cursor: c }, 'cursor');
  assert400({ ...base, assignee: 'an', limit: '2', cursor: c }, 'cursor');
  const noAssignee = { ...base };
  delete noAssignee.assignee;
  assert400({ ...noAssignee, limit: '2', cursor: c }, 'cursor');
  assert400({ ...base, sort: '-priority', limit: '2', cursor: c }, 'cursor');
  assert400({ ...base, sort: 'id', limit: '2', cursor: c }, 'cursor');
  const c2 = get({ limit: '2' }).body.nextCursor;
  assert400({ status: 'open', limit: '2', cursor: c2 }, 'cursor');
});

test('unknown query parameters are ignored', () => {
  assert.deepEqual(get({ foo: 'bar', page: '3' }).body, [...all].sort(byId));
  assert.deepEqual(get({ foo: 'bar', status: 'open' }).body, get({ status: 'open' }).body);
  assert.deepEqual(get({ foo: 'x', limit: '5' }).body, get({ limit: '5' }).body);
});
