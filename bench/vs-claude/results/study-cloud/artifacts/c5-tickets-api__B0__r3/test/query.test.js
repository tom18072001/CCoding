import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';

const h = createHandler();
const get = (query) => h({ method: 'GET', path: '/tickets', query });
const all = get({}).body;

test('no params and unknown params keep bare array by id', () => {
  assert.deepEqual(get(undefined).body, all);
  assert.deepEqual(get({ foo: 'x' }).body, all);
  assert.deepEqual(all.map((t) => t.id), all.map((t) => t.id).sort((a, b) => a - b));
  assert.equal(all.length, 23);
});

test('status filter', () => {
  const r = get({ status: 'open, closed' }).body;
  assert.deepEqual(r, all.filter((t) => ['open', 'closed'].includes(t.status)));
  assert.ok(r.length > 0);
});

test('assignee filter with none', () => {
  const r = get({ assignee: 'none,an' }).body;
  assert.deepEqual(r, all.filter((t) => t.assignee === null || t.assignee === 'an'));
  assert.deepEqual(get({ assignee: 'none' }).body, all.filter((t) => t.assignee === null));
});

test('sort -priority with id tie-break ascending', () => {
  const r = get({ sort: '-priority' }).body;
  for (let i = 1; i < r.length; i++) {
    assert.ok(r[i - 1].priority >= r[i].priority);
    if (r[i - 1].priority === r[i].priority) assert.ok(r[i - 1].id < r[i].id);
  }
  const c = get({ sort: 'createdAt' }).body;
  for (let i = 1; i < c.length; i++) assert.ok(c[i - 1].createdAt <= c[i].createdAt);
});

for (const sort of ['id', '-id', 'priority', '-priority', 'createdAt', '-createdAt']) {
  test(`walk all pages limit=5 sort=${sort}`, () => {
    const expected = get({ sort }).body.map((t) => t.id);
    const got = [];
    let cursor;
    for (let n = 0; n < 20; n++) {
      const r = get({ sort, limit: '5', ...(cursor ? { cursor } : {}) });
      assert.equal(r.status, 200);
      got.push(...r.body.items.map((t) => t.id));
      cursor = r.body.nextCursor;
      if (cursor === null) break;
    }
    assert.deepEqual(got, expected);
  });
}

test('nextCursor null on last page, also when total divisible by limit', () => {
  const big = get({ limit: '100' }).body;
  assert.equal(big.nextCursor, null);
  assert.equal(big.items.length, 23);
  const total = get({ status: 'open' }).body.length;
  assert.equal(get({ status: 'open', limit: String(total) }).body.nextCursor, null);
  assert.ok(get({ status: 'open', limit: '1' }).body.nextCursor);
});

test('cursor with filters walks filtered set', () => {
  const q = { status: 'open,resolved', assignee: 'none,an,binh', sort: '-createdAt' };
  const expected = get(q).body.map((t) => t.id);
  const got = [];
  let cursor;
  do {
    const r = get({ ...q, limit: '2', ...(cursor ? { cursor } : {}) }).body;
    got.push(...r.items.map((t) => t.id));
    cursor = r.nextCursor;
  } while (cursor);
  assert.deepEqual(got, expected);
});

const err = (q, e) => {
  const r = get(q);
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: e });
};

test('invalid_status', () => {
  err({ status: 'bogus' }, 'invalid_status');
  err({ status: '' }, 'invalid_status');
  err({ status: 'open,,closed' }, 'invalid_status');
  err({ status: ['open'] }, 'invalid_status');
});
test('invalid_assignee', () => {
  err({ assignee: '' }, 'invalid_assignee');
  err({ assignee: 'an,' }, 'invalid_assignee');
});
test('invalid_sort', () => {
  for (const s of ['title', '', '--id', '+id', '-']) err({ sort: s }, 'invalid_sort');
});
test('invalid_limit', () => {
  for (const l of ['0', '101', '1.5', '1e1', ' 5', 'abc', '', '-1']) err({ limit: l }, 'invalid_limit');
});
test('invalid_cursor', () => {
  err({ cursor: 'abc' }, 'invalid_cursor');
  err({ limit: '5', cursor: '!!!' }, 'invalid_cursor');
  err({ limit: '5', cursor: Buffer.from('{"x":1}').toString('base64url') }, 'invalid_cursor');
  const c = get({ limit: '5', sort: 'priority' }).body.nextCursor;
  err({ cursor: c, sort: 'priority' }, 'invalid_cursor'); // no limit
  err({ limit: '5', cursor: c }, 'invalid_cursor'); // different sort
  err({ limit: '5', cursor: c, sort: 'priority', status: 'open' }, 'invalid_cursor');
  assert.equal(get({ limit: '3', cursor: c, sort: 'priority' }).status, 200);
});
test('validation order: status before limit', () => {
  err({ limit: '0', status: 'x' }, 'invalid_status');
});
test('GET /tickets/:id and 404 unchanged', () => {
  assert.equal(h({ method: 'GET', path: '/tickets/3', query: {} }).body.id, 3);
  assert.equal(h({ method: 'GET', path: '/tickets/999', query: {} }).status, 404);
});
