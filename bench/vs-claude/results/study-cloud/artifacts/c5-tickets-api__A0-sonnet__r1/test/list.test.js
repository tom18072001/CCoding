import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed } from '../src/data.js';

const h = createHandler();
const get = (query) => h({ method: 'GET', path: '/tickets', query });
const ids = (b) => (Array.isArray(b) ? b : b.items).map((t) => t.id);

test('no params: bare array by id', () => {
  const r = get({});
  assert.deepEqual(ids(r.body), seed().map((t) => t.id));
  assert.ok(Array.isArray(get(undefined).body));
});

test('unknown params ignored', () => assert.equal(get({ foo: 'x' }).body.length, 23));

test('status filter', () => {
  const r = get({ status: 'open,closed' });
  assert.ok(r.body.length > 0);
  assert.ok(r.body.every((t) => ['open', 'closed'].includes(t.status)));
  assert.equal(get({ status: 'bogus' }).body.error, 'invalid_status');
  assert.equal(get({ status: 'open,' }).body.error, 'invalid_status');
  assert.equal(get({ status: '' }).status, 400);
});

test('assignee filter incl. none', () => {
  assert.ok(get({ assignee: 'none' }).body.every((t) => t.assignee === null));
  const r = get({ assignee: 'an,none' }).body;
  assert.ok(r.every((t) => t.assignee === null || t.assignee === 'an'));
  assert.equal(r.length, seed().filter((t) => t.assignee === null || t.assignee === 'an').length);
  assert.equal(get({ assignee: 'an,,x' }).body.error, 'invalid_assignee');
});

test('sort with id tiebreak', () => {
  for (const s of ['priority', '-priority', 'createdAt', '-createdAt', '-id']) {
    const f = s.replace('-', '');
    const b = get({ sort: s }).body;
    for (let i = 1; i < b.length; i++) {
      const c = b[i - 1][f] < b[i][f] ? -1 : b[i - 1][f] > b[i][f] ? 1 : 0;
      const ok = s.startsWith('-') ? c > 0 || (c === 0 && b[i - 1].id < b[i].id) : c < 0 || (c === 0 && b[i - 1].id < b[i].id);
      assert.ok(ok, s);
    }
  }
  assert.equal(get({ sort: 'title' }).body.error, 'invalid_sort');
  assert.equal(get({ sort: '--id' }).body.error, 'invalid_sort');
});

test('limit validation', () => {
  for (const l of ['0', '101', '1.5', 'abc', '', '-1', '1e1'])
    assert.deepEqual(get({ limit: l }), { status: 400, body: { error: 'invalid_limit' } }, l);
  assert.equal(get({ limit: '100' }).status, 200);
});

test('pagination walks every page for each sort', () => {
  for (const sort of ['id', '-id', 'priority', '-priority', 'createdAt', '-createdAt']) {
    const expected = ids(get({ sort, status: 'open,resolved,closed' }).body);
    const got = [];
    let cursor;
    let pages = 0;
    do {
      const r = get({ sort, status: 'open,resolved,closed', limit: '4', ...(cursor ? { cursor } : {}) });
      assert.equal(r.status, 200);
      got.push(...ids(r.body));
      cursor = r.body.nextCursor;
      pages++;
    } while (cursor);
    assert.deepEqual(got, expected, sort);
    assert.ok(pages > 1);
  }
});

test('exact-fit last page has null cursor', () => {
  const r = get({ limit: '23' });
  assert.equal(r.body.items.length, 23);
  assert.equal(r.body.nextCursor, null);
  assert.deepEqual(get({ limit: '5', status: 'open', assignee: 'zzz' }).body, { items: [], nextCursor: null });
});

test('cursor validation', () => {
  const c = get({ limit: '5', sort: 'priority' }).body.nextCursor;
  assert.equal(typeof c, 'string');
  assert.equal(get({ cursor: c }).body.error, 'invalid_cursor');
  assert.equal(get({ limit: '5', cursor: 'garbage!' }).body.error, 'invalid_cursor');
  assert.equal(get({ limit: '5', cursor: '' }).body.error, 'invalid_cursor');
  assert.equal(get({ limit: '5', cursor: Buffer.from('{"x":1}').toString('base64url') }).body.error, 'invalid_cursor');
  assert.equal(get({ limit: '5', sort: 'priority', cursor: c }).status, 200);
  assert.equal(get({ limit: '5', sort: '-priority', cursor: c }).body.error, 'invalid_cursor');
  assert.equal(get({ limit: '5', cursor: c }).body.error, 'invalid_cursor');
  assert.equal(get({ limit: '5', sort: 'priority', status: 'open', cursor: c }).body.error, 'invalid_cursor');
  assert.equal(get({ limit: '5', sort: 'priority', assignee: 'an', cursor: c }).body.error, 'invalid_cursor');
});
