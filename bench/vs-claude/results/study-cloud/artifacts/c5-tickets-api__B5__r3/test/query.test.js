import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed } from '../src/data.js';

const get = (query, h = createHandler()) => h({ method: 'GET', path: '/tickets', query });
const ids = (r) => (Array.isArray(r.body) ? r.body : r.body.items).map((t) => t.id);

test('no params: bare array sorted by id', () => {
  const r = get({});
  assert.ok(Array.isArray(r.body));
  assert.deepEqual(ids(r), seed().map((t) => t.id));
});

test('unknown params ignored', () => {
  assert.equal(get({ foo: 'bar' }).body.length, 23);
});

test('status filter', () => {
  const exp = seed().filter((t) => ['open', 'closed'].includes(t.status)).map((t) => t.id);
  assert.deepEqual(ids(get({ status: 'open,closed' })), exp);
  assert.equal(get({ status: 'bogus' }).body.error, 'invalid_status');
  assert.equal(get({ status: 'open,' }).status, 400);
  assert.equal(get({ status: '' }).body.error, 'invalid_status');
});

test('assignee filter incl. none', () => {
  const exp = seed().filter((t) => t.assignee === null || t.assignee === 'an').map((t) => t.id);
  assert.deepEqual(ids(get({ assignee: 'none,an' })), exp);
  assert.deepEqual(ids(get({ assignee: 'nobody' })), []);
  assert.equal(get({ assignee: '' }).body.error, 'invalid_assignee');
});

test('sort with id tiebreak ascending', () => {
  const all = seed();
  const p = get({ sort: 'priority' }).body;
  for (let i = 1; i < p.length; i++) {
    assert.ok(p[i - 1].priority < p[i].priority || (p[i - 1].priority === p[i].priority && p[i - 1].id < p[i].id));
  }
  const d = get({ sort: '-priority' }).body;
  for (let i = 1; i < d.length; i++) {
    assert.ok(d[i - 1].priority > d[i].priority || (d[i - 1].priority === d[i].priority && d[i - 1].id < d[i].id));
  }
  const c = get({ sort: '-createdAt' }).body;
  for (let i = 1; i < c.length; i++) {
    assert.ok(c[i - 1].createdAt > c[i].createdAt || (c[i - 1].createdAt === c[i].createdAt && c[i - 1].id < c[i].id));
  }
  assert.deepEqual(ids(get({ sort: '-id' })), all.map((t) => t.id).reverse());
  assert.equal(get({ sort: 'title' }).body.error, 'invalid_sort');
  assert.equal(get({ sort: '--id' }).body.error, 'invalid_sort');
});

test('limit validation', () => {
  for (const l of ['0', '101', '-1', '1.5', 'abc', '', '1e1']) {
    assert.deepEqual(get({ limit: l }), { status: 400, body: { error: 'invalid_limit' } }, l);
  }
  assert.equal(get({ limit: '100' }).status, 200);
});

function walk(query, limit) {
  const out = [];
  let cursor;
  for (let n = 0; n < 50; n++) {
    const r = get({ ...query, limit: String(limit), ...(cursor ? { cursor } : {}) });
    assert.equal(r.status, 200);
    out.push(...r.body.items);
    if (r.body.nextCursor === null) return out;
    assert.equal(typeof r.body.nextCursor, 'string');
    cursor = r.body.nextCursor;
  }
  assert.fail('too many pages');
}

test('pagination walks every sort/filter exactly like the unpaginated result', () => {
  for (const sort of ['id', '-id', 'priority', '-priority', 'createdAt', '-createdAt']) {
    for (const limit of [1, 4, 23, 100]) {
      for (const f of [{}, { status: 'open,resolved' }, { assignee: 'none,binh' }]) {
        const q = { sort, ...f };
        assert.deepEqual(walk(q, limit), get(q).body, JSON.stringify([q, limit]));
      }
    }
  }
});

test('last page has null cursor; exact fit has null', () => {
  assert.equal(get({ limit: '23' }).body.nextCursor, null);
  assert.notEqual(get({ limit: '22' }).body.nextCursor, null);
  assert.deepEqual(get({ limit: '5', status: 'open', assignee: 'zzz' }).body, { items: [], nextCursor: null });
});

test('cursor validation', () => {
  const c = get({ limit: '5', sort: 'priority', status: 'open,closed' }).body.nextCursor;
  const ok = { limit: '5', sort: 'priority', status: 'open,closed', cursor: c };
  assert.equal(get(ok).status, 200);
  const err = { status: 400, body: { error: 'invalid_cursor' } };
  assert.deepEqual(get({ ...ok, sort: '-priority' }), err);
  assert.deepEqual(get({ ...ok, status: 'open' }), err);
  assert.deepEqual(get({ ...ok, assignee: 'an' }), err);
  assert.deepEqual(get({ limit: '5', cursor: c }), err);
  assert.deepEqual(get({ cursor: c }), err);
  for (const bad of ['', 'garbage!', 'abc', Buffer.from('{"i":"x"}').toString('base64url'), Buffer.from('null').toString('base64url')]) {
    assert.deepEqual(get({ ...ok, cursor: bad }), err, bad);
  }
});
