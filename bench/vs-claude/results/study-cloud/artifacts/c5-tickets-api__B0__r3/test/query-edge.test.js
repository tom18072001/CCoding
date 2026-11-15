import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed } from '../src/data.js';

const h = createHandler();
const get = (query, path = '/tickets') => h({ method: 'GET', path, query });
const SORTS = ['id', '-id', 'priority', '-priority', 'createdAt', '-createdAt'];
const LIMITS = ['1', '7', '23', '100'];
const FILTERS = [{}, { status: 'open,closed' }, { status: 'in_progress,resolved,open' }, { assignee: 'none' }, { assignee: 'an,none' }, { status: 'open,closed', assignee: 'an,none' }];

function pageAll(query) {
  const items = [];
  const sizes = [];
  let cursor;
  for (let n = 0; n < 200; n++) {
    const r = get(cursor ? { ...query, cursor } : query);
    assert.equal(r.status, 200);
    items.push(...r.body.items);
    sizes.push(r.body.items.length);
    if (r.body.nextCursor === null) return { items, sizes };
    assert.equal(typeof r.body.nextCursor, 'string');
    cursor = r.body.nextCursor;
  }
  assert.fail('pagination did not terminate');
}

test('regression: no params = bare array sorted by id, equal to seed', () => {
  const r = get({});
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
  assert.deepEqual(r.body, seed().sort((a, b) => a.id - b.id));
});
test('regression: undefined query and unknown params are ignored', () => {
  const base = get({}).body;
  assert.deepEqual(h({ method: 'GET', path: '/tickets' }).body, base);
  assert.deepEqual(get({ foo: 'bar', page: '2', Limit: '3' }).body, base);
});

for (const sort of SORTS) for (const limit of LIMITS) for (const [fi, f] of FILTERS.entries()) {
  test(`pagination integrity sort=${sort} limit=${limit} filter#${fi}`, () => {
    const full = get({ ...f, sort });
    assert.ok(Array.isArray(full.body));
    const { items, sizes } = pageAll({ ...f, sort, limit });
    assert.deepEqual(items, full.body);
    assert.ok(sizes.every((s, i) => s > 0 || (i === 0 && full.body.length === 0)), 'no empty page');
    assert.ok(sizes.every((s) => s <= Number(limit)));
    if (full.body.length === 23 && 23 % Number(limit) === 0) assert.equal(sizes.length, 23 / Number(limit));
  });
}

test('filter semantics', () => {
  const all = seed();
  assert.deepEqual(get({ status: 'open,closed' }).body.map((t) => t.id), all.filter((t) => ['open', 'closed'].includes(t.status)).map((t) => t.id));
  assert.deepEqual(get({ assignee: 'none' }).body.map((t) => t.id), [5, 10, 15, 20]);
  assert.deepEqual(get({ assignee: 'an,none' }).body.map((t) => t.id), all.filter((t) => t.assignee === null || t.assignee === 'an').map((t) => t.id));
});

test('tie-break by id ascending for every sort direction', () => {
  for (const sort of ['priority', '-priority', 'createdAt', '-createdAt']) {
    const b = get({ sort }).body;
    const f = sort.replace('-', '');
    const dir = sort.startsWith('-') ? -1 : 1;
    for (let i = 1; i < b.length; i++) {
      const [p, c] = [b[i - 1], b[i]];
      assert.ok(p[f] === c[f] ? p.id < c.id : (dir === 1 ? p[f] < c[f] : p[f] > c[f]), `${sort} order at ${i}`);
    }
  }
});

test('cursor bound to status/assignee/sort', () => {
  const c = get({ sort: 'priority', limit: '3' }).body.nextCursor;
  assert.ok(c);
  assert.equal(get({ sort: 'priority', limit: '3', cursor: c }).status, 200);
  for (const q of [{ sort: '-priority' }, { sort: 'priority', status: 'open' }, { sort: 'priority', assignee: 'an' }, {}]) {
    const r = get({ ...q, limit: '3', cursor: c });
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: 'invalid_cursor' });
  }
});

test('malformed cursors', () => {
  const c = get({ limit: '3' }).body.nextCursor;
  const bad = ['!!!notbase64!!!', 'abc', '', c.slice(0, 5), 'AAAA' + c.slice(4), 'x' + c.slice(1), Buffer.from('{"f":1}').toString('base64url'), Buffer.from('null').toString('base64url'), Buffer.from('[]').toString('base64url')];
  for (const cursor of bad) {
    const r = get({ limit: '3', cursor });
    assert.equal(r.status, 400, cursor);
    assert.deepEqual(r.body, { error: 'invalid_cursor' });
  }
});

test('cursor without limit -> invalid_cursor', () => {
  const c = get({ limit: '3' }).body.nextCursor;
  assert.deepEqual(get({ cursor: c }).body, { error: 'invalid_cursor' });
  assert.equal(get({ cursor: c }).status, 400);
});

test('status order / duplicates / spaces do not matter for cursors', () => {
  const c = get({ status: 'open,closed', limit: '2' }).body.nextCursor;
  assert.ok(c);
  const a = get({ status: 'closed,open', limit: '2', cursor: c });
  assert.equal(a.status, 200);
  assert.deepEqual(a.body, get({ status: 'open,closed', limit: '2', cursor: c }).body);
  assert.equal(get({ status: 'open, closed,open', limit: '2', cursor: c }).status, 200);
});

test('limit can vary between pages', () => {
  const full = get({}).body;
  const p1 = get({ limit: '4' }).body;
  const p2 = get({ limit: '10', cursor: p1.nextCursor }).body;
  assert.deepEqual([...p1.items, ...p2.items], full.slice(0, 14));
});

test('invalid params return 400 invalid_<param>', () => {
  const cases = [
    [{ status: 'bogus' }, 'status'], [{ status: 'open,bogus' }, 'status'], [{ status: '' }, 'status'], [{ status: 'open,' }, 'status'], [{ status: 'OPEN' }, 'status'],
    [{ assignee: '' }, 'assignee'], [{ assignee: 'an,' }, 'assignee'],
    [{ sort: 'title' }, 'sort'], [{ sort: '' }, 'sort'], [{ sort: '--id' }, 'sort'], [{ sort: '-' }, 'sort'], [{ sort: 'ID' }, 'sort'],
    [{ limit: '0' }, 'limit'], [{ limit: '101' }, 'limit'], [{ limit: '1.5' }, 'limit'], [{ limit: '01' }, 'limit'], [{ limit: '' }, 'limit'], [{ limit: '-1' }, 'limit'], [{ limit: 'abc' }, 'limit'], [{ limit: ' 5' }, 'limit'], [{ limit: '1e1' }, 'limit'],
    [{ cursor: 'zzz', limit: '5' }, 'cursor'], [{ cursor: 'zzz' }, 'cursor'],
  ];
  for (const [q, p] of cases) {
    const r = get(q);
    assert.equal(r.status, 400, JSON.stringify(q));
    assert.deepEqual(r.body, { error: `invalid_${p}` }, JSON.stringify(q));
  }
});

test('error precedence status > assignee > sort > limit > cursor', () => {
  assert.equal(get({ status: 'x', assignee: '', sort: 'x', limit: '0', cursor: 'x' }).body.error, 'invalid_status');
  assert.equal(get({ assignee: '', sort: 'x', limit: '0', cursor: 'x' }).body.error, 'invalid_assignee');
  assert.equal(get({ sort: 'x', limit: '0', cursor: 'x' }).body.error, 'invalid_sort');
  assert.equal(get({ limit: '0', cursor: 'x' }).body.error, 'invalid_limit');
});

test('limit 1 and 100 accepted; response shape', () => {
  const a = get({ limit: '1' });
  assert.equal(a.status, 200);
  assert.equal(a.body.items.length, 1);
  assert.ok(typeof a.body.nextCursor === 'string');
  const b = get({ limit: '100' });
  assert.equal(b.status, 200);
  assert.equal(b.body.items.length, 23);
  assert.equal(b.body.nextCursor, null);
  assert.deepEqual(Object.keys(b.body).sort(), ['items', 'nextCursor']);
});

test('empty filter result with limit', () => {
  const r = get({ status: 'open', assignee: 'nobody', limit: '5' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { items: [], nextCursor: null });
});

test('GET /tickets/:id and 404 unchanged', () => {
  assert.deepEqual(get({}, '/tickets/7').body, seed()[6]);
  assert.equal(get({}, '/tickets/7').status, 200);
  assert.deepEqual(get({}, '/tickets/999'), { status: 404, body: { error: 'not_found' } });
  assert.deepEqual(get({}, '/nope'), { status: 404, body: { error: 'not_found' } });
  assert.deepEqual(h({ method: 'POST', path: '/tickets', query: {} }), { status: 404, body: { error: 'not_found' } });
  assert.equal(get({ limit: '0', sort: 'x' }, '/tickets/7').status, 200);
});
