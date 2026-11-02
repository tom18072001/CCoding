import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed } from '../src/data.js';

const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const err = (query, code) => {
  const r = get(query);
  assert.equal(r.status, 400, JSON.stringify(query));
  assert.deepEqual(r.body, { error: code }, JSON.stringify(query));
};
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const ids = (a) => a.map((t) => t.id);

test('limit invalid values -> invalid_limit', () => {
  for (const limit of ['0', '101', '1.5', 'abc', '', '-1', ' 5', '1e1', '+5']) err({ limit }, 'invalid_limit');
});

test('limit=100 returns one page with null cursor; limit=1 and 23 boundaries', () => {
  const r = get({ limit: '100' });
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 23);
  assert.equal(r.body.nextCursor, null);
  assert.equal(get({ limit: '23' }).body.nextCursor, null);
  assert.equal(get({ limit: '22' }).body.items.length, 22);
  assert.notEqual(get({ limit: '22' }).body.nextCursor, null);
  assert.equal(get({ limit: '1' }).body.items.length, 1);
});

test('garbage or malformed cursors -> invalid_cursor', () => {
  const fp = '||id';
  const bad = [
    'not a cursor!!', '', '***', b64('not json'), b64('null'), b64('42'), b64('[]'), b64({}),
    b64({ f: fp }), b64({ v: [1, 1] }), b64({ v: [1], f: fp }), b64({ v: [1, 1, 1], f: fp }),
    b64({ v: 'xx', f: fp }), b64({ v: ['a', 1], f: fp }), b64({ v: [1, 'a'], f: fp }),
    b64({ v: [1, 1.5], f: fp }), b64({ v: [1, null], f: fp }), b64({ v: [1, 1], f: 5 }),
  ];
  for (const cursor of bad) err({ limit: '5', cursor }, 'invalid_cursor');
  // wrong value type for sort field
  err({ limit: '5', sort: 'createdAt', cursor: b64({ v: [3, 1], f: '||createdAt' }) }, 'invalid_cursor');
});

test('cursor from different status/sort/assignee -> invalid_cursor', () => {
  const c1 = get({ status: 'open', limit: '2' }).body.nextCursor;
  assert.ok(c1);
  err({ status: 'closed', limit: '2', cursor: c1 }, 'invalid_cursor');
  err({ limit: '2', cursor: c1 }, 'invalid_cursor');
  const c2 = get({ sort: 'priority', limit: '2' }).body.nextCursor;
  err({ sort: '-priority', limit: '2', cursor: c2 }, 'invalid_cursor');
  const c3 = get({ assignee: 'an', limit: '1' }).body.nextCursor;
  assert.ok(c3);
  err({ assignee: 'binh', limit: '1', cursor: c3 }, 'invalid_cursor');
  // same params still valid
  assert.equal(get({ status: 'open', limit: '2', cursor: c1 }).status, 200);
});

test('cursor without limit -> invalid_cursor', () => {
  const c = get({ limit: '2' }).body.nextCursor;
  err({ cursor: c }, 'invalid_cursor');
  err({ cursor: 'junk' }, 'invalid_cursor');
});

test('multiple errors follow order status > assignee > sort > limit > cursor', () => {
  err({ status: 'x', assignee: '', sort: 'bad', limit: '0', cursor: 'z' }, 'invalid_status');
  err({ assignee: '', sort: 'bad', limit: '0', cursor: 'z' }, 'invalid_assignee');
  err({ sort: 'bad', limit: '0', cursor: 'z' }, 'invalid_sort');
  err({ limit: '0', cursor: 'z' }, 'invalid_limit');
  err({ cursor: 'z' }, 'invalid_cursor');
  err({ status: 'open,,closed' }, 'invalid_status');
  err({ status: '' }, 'invalid_status');
  err({ sort: '--id' }, 'invalid_sort');
  err({ sort: 'title' }, 'invalid_sort');
  err({ sort: '' }, 'invalid_sort');
});

const walk = (base, limit) => {
  const out = [];
  let cursor;
  for (let n = 0; n < 100; n++) {
    const q = { ...base, limit: String(limit) };
    if (cursor) q.cursor = cursor;
    const r = get(q);
    assert.equal(r.status, 200);
    assert.ok(r.body.items.length <= limit);
    out.push(...r.body.items);
    cursor = r.body.nextCursor;
    if (cursor === null) return out;
  }
  assert.fail('pagination did not terminate');
};

test('full pagination equals unpaginated list for every sort x filter', () => {
  const filters = [{}, { status: 'open,closed' }, { assignee: 'none,an' }, { status: 'resolved', assignee: 'binh,chi' }, { status: 'in_progress', assignee: 'nobody' }];
  for (const sort of ['id', 'priority', '-priority', 'createdAt', '-createdAt']) {
    for (const f of filters) {
      const base = { ...f, sort };
      const expected = get(base).body;
      assert.ok(Array.isArray(expected));
      for (const limit of [1, 2, 4, 7, 22, 23, 100]) {
        assert.deepEqual(walk(base, limit), expected, `${JSON.stringify(base)} limit=${limit}`);
      }
    }
  }
});

test('tie-break by id ascending even for descending sorts', () => {
  for (const [sort, key] of [['-priority', 'priority'], ['-createdAt', 'createdAt'], ['priority', 'priority'], ['createdAt', 'createdAt']]) {
    const desc = sort.startsWith('-');
    const rows = walk({ sort }, 3);
    let ties = 0;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (a[key] === b[key]) { ties++; assert.ok(a.id < b.id, `${sort}: ${a.id} before ${b.id}`); }
      else assert.ok(desc ? a[key] > b[key] : a[key] < b[key]);
    }
    if (key === 'priority') assert.ok(ties > 0, `${sort}: fixture should have ties`); // createdAt is unique in seed
  }
});

test('assignee none,an and unknown params', () => {
  const all = seed();
  assert.deepEqual(ids(get({ assignee: 'none,an' }).body), ids(all.filter((t) => t.assignee === null || t.assignee === 'an')));
  assert.equal(get({ foo: 'bar', page: '2' }).body.length, 23);
  const r = get({ limit: '5', extra: '1', debug: 'true' });
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 5);
});

test('no params still returns bare array of 23 sorted by id', () => {
  const r = get({});
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
  assert.equal(r.body.length, 23);
  assert.deepEqual(ids(r.body), ids(seed()));
});
