import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { seed, STATUSES } from '../src/data.js';

const all = seed();
const get = (query) => createHandler()({ method: 'GET', path: '/tickets', query });
const ids = (arr) => arr.map((t) => t.id);

// Oracle độc lập với src/query.js
function expected({ status, assignee, sort = 'id' } = {}) {
  const st = status && status.split(',');
  const as = assignee && assignee.split(',');
  const desc = sort.startsWith('-');
  const f = desc ? sort.slice(1) : sort;
  return all
    .filter((t) => !st || st.includes(t.status))
    .filter((t) => !as || as.some((a) => (a === 'none' ? t.assignee === null : t.assignee === a)))
    .sort((a, b) => {
      const x = a[f], y = b[f];
      const c = x < y ? -1 : x > y ? 1 : 0;
      return (desc ? -c : c) || a.id - b.id;
    });
}

function walk(query, limit) {
  const pages = [];
  let cursor;
  for (let n = 0; n < 200; n++) {
    const r = get({ ...query, limit: String(limit), ...(cursor ? { cursor } : {}) });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ['items', 'nextCursor']);
    assert.ok(r.body.items.length <= limit);
    pages.push(r.body);
    if (r.body.nextCursor === null) return pages;
    assert.equal(typeof r.body.nextCursor, 'string');
    cursor = r.body.nextCursor;
  }
  assert.fail('too many pages');
}

test('không tham số: mảng trần theo id', () => {
  const r = get({});
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
  assert.deepEqual(ids(r.body), ids(expected()));
  assert.deepEqual(r.body, [...all].sort((a, b) => a.id - b.id));
});

test('status một và nhiều giá trị', () => {
  for (const s of STATUSES) {
    const r = get({ status: s });
    assert.ok(Array.isArray(r.body));
    assert.ok(r.body.length > 0);
    assert.deepEqual(ids(r.body), ids(expected({ status: s })));
  }
  assert.deepEqual(ids(get({ status: 'open,closed' }).body), ids(expected({ status: 'open,closed' })));
});

test('assignee: tên, none, và kết hợp', () => {
  assert.deepEqual(ids(get({ assignee: 'an' }).body), ids(expected({ assignee: 'an' })));
  const none = get({ assignee: 'none' }).body;
  assert.ok(none.length > 0 && none.every((t) => t.assignee === null));
  assert.deepEqual(ids(none), ids(expected({ assignee: 'none' })));
  assert.deepEqual(ids(get({ assignee: 'none,an' }).body), ids(expected({ assignee: 'none,an' })));
  assert.deepEqual(ids(get({ assignee: 'an,binh' }).body), ids(expected({ assignee: 'an,binh' })));
});

test('kết hợp status và assignee', () => {
  const q = { status: 'open,closed', assignee: 'none,chi' };
  assert.deepEqual(ids(get(q).body), ids(expected(q)));
  const q2 = { status: 'open,closed', assignee: 'none' };
  assert.deepEqual(ids(get(q2).body), ids(expected(q2)));
});

test('sort mọi trường, hai chiều, tie-break id tăng', () => {
  for (const sort of ['id', '-id', 'priority', '-priority', 'createdAt', '-createdAt']) {
    const r = get({ sort });
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 23);
    assert.deepEqual(ids(r.body), ids(expected({ sort })), sort);
  }
  // seed có trùng priority nên tie-break thực sự được thử
  assert.ok(new Set(all.map((t) => t.priority)).size < all.length);
  const d = get({ sort: '-priority' }).body;
  for (let i = 1; i < d.length; i++) {
    if (d[i].priority === d[i - 1].priority) assert.ok(d[i].id > d[i - 1].id);
    else assert.ok(d[i].priority < d[i - 1].priority);
  }
});

test('sort kết hợp filter khi không limit', () => {
  const q = { status: 'open,resolved', assignee: 'none,dung,an', sort: '-createdAt' };
  assert.deepEqual(ids(get(q).body), ids(expected(q)));
});

test('duyệt hết các trang: không trùng, không sót, khớp kết quả không phân trang', () => {
  const queries = [{}, { sort: 'priority' }, { sort: '-priority' }, { sort: 'createdAt' }, { sort: '-createdAt' }, { sort: '-id' },
    { status: 'open,closed', sort: '-priority' }, { assignee: 'none,an', sort: 'createdAt' }];
  for (const q of queries) {
    const full = get(q).body;
    assert.deepEqual(ids(full), ids(expected(q)));
    for (const limit of [1, 5, 23, 100]) {
      const pages = walk(q, limit);
      const got = pages.flatMap((p) => p.items);
      assert.deepEqual(got, full, JSON.stringify(q) + ' limit ' + limit);
      assert.equal(new Set(ids(got)).size, got.length);
      assert.equal(pages.length, Math.ceil(full.length / limit) || 1);
      pages.slice(0, -1).forEach((p) => assert.notEqual(p.nextCursor, null));
      assert.equal(pages.at(-1).nextCursor, null);
    }
  }
});

test('nextCursor null ở trang cuối khi tổng chia hết limit', () => {
  const r = get({ limit: '23' });
  assert.equal(r.body.items.length, 23);
  assert.equal(r.body.nextCursor, null);
  // 23 ticket, limit 1: trang 22 còn cursor, trang 23 null
  const pages = walk({}, 1);
  assert.equal(pages.length, 23);
  assert.notEqual(pages[21].nextCursor, null);
  assert.equal(pages[22].nextCursor, null);
  // tập lọc có tổng chia hết limit
  const n = expected({ assignee: 'none' }).length;
  const p2 = walk({ assignee: 'none' }, n);
  assert.equal(p2.length, 1);
  assert.equal(p2[0].nextCursor, null);
  const first = get({ limit: '1' });
  assert.equal(first.body.items.length, 1);
  assert.equal(typeof first.body.nextCursor, 'string');
  assert.equal(get({ limit: '100' }).body.nextCursor, null);
});

test('limit kèm filter rỗng cho items=[] và nextCursor=null', () => {
  const r = get({ assignee: 'khong_ton_tai', limit: '5' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { items: [], nextCursor: null });
  assert.deepEqual(get({ assignee: 'khong_ton_tai' }).body, []);
});

test('cursor mismatch khi đổi status, assignee hoặc sort', () => {
  const base = { status: 'open,in_progress,resolved', assignee: 'none,an,binh,chi', sort: 'priority' };
  const c = get({ ...base, limit: '2' }).body.nextCursor;
  assert.equal(typeof c, 'string');
  assert.equal(get({ ...base, limit: '2', cursor: c }).status, 200);
  for (const change of [{ status: 'open' }, { assignee: 'none,an' }, { sort: '-priority' }, { sort: 'id' }]) {
    const r = get({ ...base, ...change, limit: '2', cursor: c });
    assert.equal(r.status, 400, JSON.stringify(change));
    assert.deepEqual(r.body, { error: 'invalid_cursor' });
  }
  for (const k of ['status', 'assignee', 'sort']) {
    const rest = { ...base };
    delete rest[k];
    assert.deepEqual(get({ ...rest, limit: '2', cursor: c }).body, { error: 'invalid_cursor' }, k);
  }
  const c2 = get({ limit: '2' }).body.nextCursor;
  assert.deepEqual(get({ status: 'open', limit: '2', cursor: c2 }).body, { error: 'invalid_cursor' });
});

test('invalid_status', () => {
  for (const status of ['x', 'open,x', 'OPEN', '', 'open,']) {
    const r = get({ status });
    assert.equal(r.status, 400, JSON.stringify(status));
    assert.deepEqual(r.body, { error: 'invalid_status' });
  }
  assert.deepEqual(get({ status: 'x', limit: '5' }).body, { error: 'invalid_status' });
});

test('invalid_sort', () => {
  for (const sort of ['title', '-title', 'foo', '', '--id', 'ID', '+id']) {
    const r = get({ sort });
    assert.equal(r.status, 400, JSON.stringify(sort));
    assert.deepEqual(r.body, { error: 'invalid_sort' });
  }
});

test('invalid_limit', () => {
  for (const limit of ['0', '101', '1.5', 'abc', '', '-1', ' 5', '1e1', '1000']) {
    const r = get({ limit });
    assert.equal(r.status, 400, JSON.stringify(limit));
    assert.deepEqual(r.body, { error: 'invalid_limit' });
  }
  assert.equal(get({ limit: '1' }).status, 200);
  assert.equal(get({ limit: '100' }).status, 200);
});

test('invalid_cursor: rác và cursor không kèm limit', () => {
  const junk = ['garbage', '!!!', '', 'e30', Buffer.from('{"a":1}').toString('base64url'), Buffer.from('not json').toString('base64url')];
  for (const cursor of junk) {
    const r = get({ limit: '5', cursor });
    assert.equal(r.status, 400, JSON.stringify(cursor));
    assert.deepEqual(r.body, { error: 'invalid_cursor' });
  }
  const c = get({ limit: '2' }).body.nextCursor;
  const r = get({ cursor: c });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: 'invalid_cursor' });
  assert.deepEqual(get({ cursor: 'garbage' }).body, { error: 'invalid_cursor' });
});

test('tham số lạ bị bỏ qua', () => {
  assert.deepEqual(get({ foo: 'bar', page: '2', q: 'x' }).body, get({}).body);
  assert.deepEqual(get({ status: 'open', zzz: '1', limit: '3' }), get({ status: 'open', limit: '3' }));
});
