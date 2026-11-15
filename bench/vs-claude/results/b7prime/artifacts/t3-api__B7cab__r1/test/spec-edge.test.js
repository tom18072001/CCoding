'use strict';
// Bộ test biên độc lập theo FEATURES.md, gọi API qua HTTP thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { start } = require('./helpers');

const USERS = [
  { id: 'u1', name: 'Admin', role: 'admin', team: null },
  { id: 'u2', name: 'MgrA', role: 'manager', team: 'A' },
  { id: 'u3', name: 'MemA', role: 'member', team: 'A' },
  { id: 'u4', name: 'MemB', role: 'member', team: 'B' },
];
const T = (id, o = {}) => ({
  id, title: 'x', status: 'todo', priority: 1, assignee: null, team: 'A',
  dueDate: null, createdAt: '2026-10-01T00:00:00.000Z', ...o,
});
const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });
const ids = (r) => r.json.items.map((t) => t.id);
const NOW = new Date('2026-11-01T00:00:00Z');

async function withApp(tasks, fn) {
  const app = await start({ seed: { users: USERS, tasks }, now: () => NOW });
  try { await fn(app); } finally { await app.close(); }
}
const errOf = (r, status, code, field) => {
  assert.equal(r.status, status, r.text);
  assert.equal(r.json.error.code, code);
  if (field !== undefined) assert.equal(r.json.error.field, field);
};
const rawGet = (base, path, user) => new Promise((resolve, reject) => {
  http.get(base + path, { headers: { 'x-user': user } }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(chunks) }));
  }).on('error', reject);
});

// ---------- 1. Xác thực & phân quyền ----------
test('401: X-User thiếu hoặc lạ trên mọi route /tasks và /audit', () =>
  withApp([T('t1')], async (a) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'],
      ['DELETE', '/tasks/t1'], ['GET', '/tasks/nope']]) {
      errOf(await a.call(m, p), 401, 'UNAUTHENTICATED');
      errOf(await a.call(m, p, as('zzz')), 401, 'UNAUTHENTICATED');
    }
    errOf(await a.call('POST', '/tasks', { body: { title: 'a', team: 'A' } }), 401, 'UNAUTHENTICATED');
    // 401 đi trước 400 query
    errOf(await a.call('GET', '/tasks?page=abc'), 401, 'UNAUTHENTICATED');
  }));

test('member: nhiệm vụ nhóm khác → 404 trước 403 (GET/PATCH/DELETE)', () =>
  withApp([T('t1', { team: 'B', assignee: 'u4' })], async (a) => {
    errOf(await a.call('GET', '/tasks/t1', as('u3')), 404, 'NOT_FOUND');
    errOf(await a.call('PATCH', '/tasks/t1', withBody('u3', { title: 'zz' })), 404, 'NOT_FOUND');
    errOf(await a.call('DELETE', '/tasks/t1', as('u3')), 404, 'NOT_FOUND');
    errOf(await a.call('DELETE', '/tasks/t1', as('u4')), 403, 'FORBIDDEN');
  }));

test('member: chỉ sửa status của nhiệm vụ giao cho mình; trùng giá trị cũ vẫn 403', () =>
  withApp([T('t1', { assignee: 'u3' }), T('t2', { assignee: null })], async (a) => {
    errOf(await a.call('PATCH', '/tasks/t1', withBody('u3', { status: 'todo', title: 'x' })), 403, 'FORBIDDEN');
    errOf(await a.call('PATCH', '/tasks/t1', withBody('u3', { title: 'x' })), 403, 'FORBIDDEN');
    errOf(await a.call('PATCH', '/tasks/t2', withBody('u3', { status: 'doing' })), 403, 'FORBIDDEN');
    const ok = await a.call('PATCH', '/tasks/t1', withBody('u3', { status: 'doing' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'doing');
    errOf(await a.call('POST', '/tasks', withBody('u3', { title: 'a', team: 'A' })), 403, 'FORBIDDEN');
  }));

test('manager: tạo/sửa/chuyển nhóm khác → 403, không xóa; đọc mọi nhóm', () =>
  withApp([T('t1', { team: 'A' }), T('t2', { team: 'B' })], async (a) => {
    assert.equal((await a.call('GET', '/tasks/t2', as('u2'))).status, 200);
    assert.equal((await a.call('GET', '/tasks', as('u2'))).json.total, 2);
    errOf(await a.call('POST', '/tasks', withBody('u2', { title: 'a', team: 'B' })), 403, 'FORBIDDEN');
    assert.equal((await a.call('POST', '/tasks', withBody('u2', { title: 'a', team: 'A' }))).status, 201);
    errOf(await a.call('PATCH', '/tasks/t2', withBody('u2', { title: 'k' })), 403, 'FORBIDDEN');
    errOf(await a.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' })), 403, 'FORBIDDEN');
    assert.equal((await a.call('PATCH', '/tasks/t1', withBody('u2', { title: 'k' }))).status, 200);
    errOf(await a.call('DELETE', '/tasks/t1', as('u2')), 403, 'FORBIDDEN');
    assert.equal((await a.call('DELETE', '/tasks/t1', as('u1'))).status, 204);
  }));

test('member: danh sách tự lọc nhóm; team khác → rỗng, không lỗi', () =>
  withApp([T('t1', { team: 'A' }), T('t2', { team: 'B' })], async (a) => {
    assert.deepEqual(ids(await a.call('GET', '/tasks', as('u3'))), ['t1']);
    const r = await a.call('GET', '/tasks?team=B', as('u3'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items, []);
    assert.equal(r.json.total, 0);
  }));

test('thứ tự: 400 query trước 404', () =>
  withApp([T('t1')], async (a) => {
    errOf(await a.call('GET', '/tasks?page=0', as('u3')), 400, 'INVALID_QUERY', 'page');
  }));

// ---------- 2. Danh sách ----------
test('q: không phân biệt dấu, hoa/thường, đ/Đ; q rỗng = không lọc', () =>
  withApp([
    T('t1', { title: 'Đường đi ĐẸP' }), T('t2', { title: 'Thiết kế' }), T('t3', { title: 'khác' }),
  ], async (a) => {
    assert.deepEqual(ids(await a.call('GET', '/tasks?q=duong', as('u1'))), ['t1']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?q=' + encodeURIComponent('Đẹp'), as('u1'))), ['t1']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?q=dd', as('u1'))), []);
    assert.deepEqual(ids(await a.call('GET', '/tasks?q=THIET%20KE', as('u1'))), ['t2']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?q=' + encodeURIComponent('thiết'), as('u1'))), ['t2']);
    assert.equal((await a.call('GET', '/tasks?q=', as('u1'))).json.total, 3);
  }));

test('q: dạng NFD của đầu vào cũng khớp', () =>
  withApp([T('t1', { title: 'Thiết kế' })], async (a) => {
    const nfd = 'thiết'.normalize('NFD');
    assert.deepEqual(ids(await a.call('GET', '/tasks?q=' + encodeURIComponent(nfd), as('u1'))), ['t1']);
  }));

test('sort hòa id theo số t2 < t10 ở cả hai chiều', () =>
  withApp([T('t10', { priority: 1 }), T('t2', { priority: 1 }), T('t1', { priority: 1 })], async (a) => {
    assert.deepEqual(ids(await a.call('GET', '/tasks?sort=priority', as('u1'))), ['t1', 't2', 't10']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?sort=-priority', as('u1'))), ['t1', 't2', 't10']);
    assert.deepEqual(ids(await a.call('GET', '/tasks', as('u1'))), ['t1', 't2', 't10']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?sort=-createdAt', as('u1'))), ['t1', 't2', 't10']);
  }));

test('sort dueDate: null luôn cuối ở cả tăng và giảm', () =>
  withApp([
    T('t1', { dueDate: null }), T('t2', { dueDate: '2026-12-01' }), T('t3', { dueDate: '2026-11-01' }),
    T('t4', { dueDate: null }),
  ], async (a) => {
    assert.deepEqual(ids(await a.call('GET', '/tasks?sort=dueDate', as('u1'))), ['t3', 't2', 't1', 't4']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?sort=-dueDate', as('u1'))), ['t2', 't3', 't1', 't4']);
  }));

test('sort title (vi) và priority giảm dần', () =>
  withApp([T('t1', { title: 'b', priority: 1 }), T('t2', { title: 'a', priority: 3 }), T('t3', { title: 'ă', priority: 2 })],
    async (a) => {
      assert.deepEqual(ids(await a.call('GET', '/tasks?sort=title', as('u1'))),
        [...['t1', 't2', 't3']].sort((x, y) => {
          const ti = { t1: 'b', t2: 'a', t3: 'ă' };
          return ti[x].localeCompare(ti[y], 'vi');
        }));
      assert.deepEqual(ids(await a.call('GET', '/tasks?sort=-priority', as('u1'))), ['t2', 't3', 't1']);
    }));

test('lọc status nhiều giá trị, assignee=none, team, dueBefore (loại null, bao gồm biên)', () =>
  withApp([
    T('t1', { status: 'todo', assignee: 'u3', dueDate: '2026-11-05' }),
    T('t2', { status: 'doing', assignee: null, dueDate: '2026-11-04' }),
    T('t3', { status: 'done', assignee: null, dueDate: null, team: 'B' }),
  ], async (a) => {
    assert.deepEqual(ids(await a.call('GET', '/tasks?status=todo,doing', as('u1'))), ['t1', 't2']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?assignee=none', as('u1'))), ['t2', 't3']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?team=B', as('u1'))), ['t3']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?dueBefore=2026-11-05', as('u1'))), ['t1', 't2']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?dueBefore=2026-11-04', as('u1'))), ['t2']);
  }));

test('phân trang: vượt trang → 200, items rỗng, total đúng', () =>
  withApp([T('t1'), T('t2'), T('t3')], async (a) => {
    const r = await a.call('GET', '/tasks?page=5&pageSize=2', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { items: [], total: 3, page: 5, pageSize: 2 });
    const p2 = await a.call('GET', '/tasks?page=2&pageSize=2', as('u1'));
    assert.deepEqual(ids(p2), ['t3']);
    assert.equal((await a.call('GET', '/tasks?pageSize=100', as('u1'))).status, 200);
    assert.equal((await a.call('GET', '/tasks?pageSize=1', as('u1'))).status, 200);
  }));

test('400 INVALID_QUERY đúng field cho giá trị xấu', () =>
  withApp([T('t1')], async (a) => {
    const bad = [
      ['page=1.5', 'page'], ['page=0', 'page'], ['page=abc', 'page'], ['page=-1', 'page'], ['page=', 'page'],
      ['pageSize=101', 'pageSize'], ['pageSize=0', 'pageSize'], ['pageSize=1.5', 'pageSize'],
      ['status=todo,xyz', 'status'], ['status=', 'status'], ['team=C', 'team'], ['team=a', 'team'],
      ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2026-2-3', 'dueBefore'], ['dueBefore=abc', 'dueBefore'],
      ['sort=foo', 'sort'], ['sort=--title', 'sort'], ['sort=id', 'sort'],
    ];
    for (const [qs, field] of bad) errOf(await a.call('GET', '/tasks?' + qs, as('u1')), 400, 'INVALID_QUERY', field);
  }));

test('tham số lặp hoặc lạ → 400 (field = tên tham số)', () =>
  withApp([T('t1')], async (a) => {
    errOf(await a.call('GET', '/tasks?team=A&team=A', as('u1')), 400, 'INVALID_QUERY', 'team');
    errOf(await a.call('GET', '/tasks?q=a&q=b', as('u1')), 400, 'INVALID_QUERY', 'q');
    errOf(await a.call('GET', '/tasks?foo=1', as('u1')), 400, 'INVALID_QUERY', 'foo');
  }));

test('nhiều lỗi → báo tham số đầu tiên theo thứ tự trên URL', () =>
  withApp([T('t1')], async (a) => {
    errOf(await a.call('GET', '/tasks?sort=bad&page=0', as('u1')), 400, 'INVALID_QUERY', 'sort');
    errOf(await a.call('GET', '/tasks?page=0&sort=bad', as('u1')), 400, 'INVALID_QUERY', 'page');
    errOf(await a.call('GET', '/tasks?team=Z&foo=1', as('u1')), 400, 'INVALID_QUERY', 'team');
    errOf(await a.call('GET', '/tasks?foo=1&team=Z', as('u1')), 400, 'INVALID_QUERY', 'foo');
  }));

// ---------- 3. CSV ----------
test('export.csv: header, BOM thô, CRLF, tiêu đề, RFC 4180, chống công thức, null', () =>
  withApp([
    T('t1', { title: 'a,b', assignee: 'u3', dueDate: '2026-11-05' }),
    T('t2', { title: 'nói "hay"' }),
    T('t3', { title: 'dòng1\ndòng2' }),
    T('t4', { title: '=SUM(A1)' }),
    T('t5', { title: '+1' }),
    T('t6', { title: '-1' }),
    T('t7', { title: '@x' }),
    T('t8', { title: '\tx' }),
    T('t9', { title: '\rx' }),
    T('t10', { title: '=a,b' }),
    T('t11', { title: 'ok', priority: 3 }),
  ], async (a) => {
    const r = await rawGet(a.base, '/tasks/export.csv', 'u1');
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-type'], 'text/csv; charset=utf-8');
    assert.equal(r.headers['content-disposition'], 'attachment; filename="tasks.csv"');
    assert.deepEqual([...r.buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.notDeepEqual([...r.buf.subarray(3, 6)], [0xef, 0xbb, 0xbf]);
    const s = r.buf.toString('utf8').slice(1);
    assert.ok(s.endsWith('\r\n'));
    assert.ok(s.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    const lines = s.split('\r\n');
    assert.equal(lines.pop(), '');
    const has = (l) => assert.ok(s.includes(l + '\r\n'), `thiếu dòng: ${JSON.stringify(l)}\nthực tế: ${JSON.stringify(s)}`);
    has('t1,"a,b",todo,1,u3,A,2026-11-05,2026-10-01T00:00:00.000Z');
    has('t2,"nói ""hay""",todo,1,,A,,2026-10-01T00:00:00.000Z');
    has('t3,"dòng1\ndòng2",todo,1,,A,,2026-10-01T00:00:00.000Z');
    has("t4,'=SUM(A1),todo,1,,A,,2026-10-01T00:00:00.000Z");
    has("t5,'+1,todo,1,,A,,2026-10-01T00:00:00.000Z");
    has("t6,'-1,todo,1,,A,,2026-10-01T00:00:00.000Z");
    has("t7,'@x,todo,1,,A,,2026-10-01T00:00:00.000Z");
    has("t8,'\tx,todo,1,,A,,2026-10-01T00:00:00.000Z");
    has("t9,\"'\rx\",todo,1,,A,,2026-10-01T00:00:00.000Z");
    has("t10,\"'=a,b\",todo,1,,A,,2026-10-01T00:00:00.000Z");
    has('t11,ok,todo,3,,A,,2026-10-01T00:00:00.000Z');
  }));

test('export.csv: lọc/sắp xếp/quyền như danh sách, không phân trang', () =>
  withApp([T('t1', { team: 'A', title: 'Đường' }), T('t2', { team: 'B' }), T('t3', { team: 'A' })], async (a) => {
    const rows = async (path, u) => {
      const r = await rawGet(a.base, path, u);
      assert.equal(r.status, 200);
      return r.buf.toString('utf8').slice(1).split('\r\n').slice(1, -1).map((l) => l.split(',')[0]);
    };
    assert.deepEqual(await rows('/tasks/export.csv', 'u3'), ['t1', 't3']);
    assert.deepEqual(await rows('/tasks/export.csv?q=duong', 'u1'), ['t1']);
    assert.deepEqual(await rows('/tasks/export.csv?sort=-createdAt', 'u1'), ['t1', 't2', 't3']);
    assert.deepEqual(await rows('/tasks/export.csv?team=B', 'u3'), []);
  }));

test('export.csv: page/pageSize/tham số lạ → 400; thiếu X-User → 401', () =>
  withApp([T('t1')], async (a) => {
    errOf(await a.call('GET', '/tasks/export.csv?page=1', as('u1')), 400, 'INVALID_QUERY', 'page');
    errOf(await a.call('GET', '/tasks/export.csv?pageSize=10', as('u1')), 400, 'INVALID_QUERY', 'pageSize');
    errOf(await a.call('GET', '/tasks/export.csv?foo=1', as('u1')), 400, 'INVALID_QUERY', 'foo');
    errOf(await a.call('GET', '/tasks/export.csv'), 401, 'UNAUTHENTICATED');
  }));

// ---------- 4. Audit ----------
test('audit: seq, at, userId, action, taskId, changes; mới nhất trước; lỗi không ghi', () =>
  withApp([T('t1', { assignee: 'u3', title: 'cũ' })], async (a) => {
    const c = await a.call('POST', '/tasks', withBody('u1', { title: 'n', team: 'A', priority: 2 }));
    assert.equal(c.status, 201);
    const id = c.json.id;
    assert.equal((await a.call('PATCH', `/tasks/${id}`, withBody('u2', { title: 'n', priority: 3, status: 'doing' }))).status, 200);
    // thao tác lỗi: không ghi
    errOf(await a.call('PATCH', `/tasks/${id}`, withBody('u3', { status: 'done' })), 403, 'FORBIDDEN');
    errOf(await a.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' })), 400, 'VALIDATION');
    errOf(await a.call('DELETE', '/tasks/nope', as('u1')), 404, 'NOT_FOUND');
    assert.equal((await a.call('DELETE', `/tasks/${id}`, as('u1'))).status, 204);
    const r = await a.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(r.json.items.map((e) => e.action), ['delete', 'update', 'create']);
    assert.deepEqual(r.json.items[0], { seq: 3, at: NOW.toISOString(), userId: 'u1', action: 'delete', taskId: id, changes: [] });
    assert.deepEqual(r.json.items[1].changes, ['priority', 'status']); // title không đổi
    assert.equal(r.json.items[1].userId, 'u2');
    assert.deepEqual(r.json.items[2].changes, ['priority', 'team', 'title']); // sắp a→z
    assert.deepEqual(Object.keys(r.json).sort(), ['items']);
  }));

test('audit: admin-only, lọc taskId, tham số lạ → 400', () =>
  withApp([T('t1')], async (a) => {
    errOf(await a.call('GET', '/audit', as('u2')), 403, 'FORBIDDEN');
    errOf(await a.call('GET', '/audit', as('u3')), 403, 'FORBIDDEN');
    await a.call('PATCH', '/tasks/t1', withBody('u1', { title: 'm' }));
    const c = await a.call('POST', '/tasks', withBody('u1', { title: 'n', team: 'A' }));
    const all = await a.call('GET', '/audit', as('u1'));
    assert.equal(all.json.items.length, 2);
    const f = await a.call('GET', '/audit?taskId=t1', as('u1'));
    assert.deepEqual(f.json.items.map((e) => e.taskId), ['t1']);
    assert.deepEqual((await a.call('GET', `/audit?taskId=${c.json.id}`, as('u1'))).json.items.length, 1);
    assert.deepEqual((await a.call('GET', '/audit?taskId=zzz', as('u1'))).json.items, []);
    errOf(await a.call('GET', '/audit?foo=1', as('u1')), 400, 'INVALID_QUERY', 'foo');
    errOf(await a.call('GET', '/audit?foo=1', as('u2')), 400, 'INVALID_QUERY', 'foo'); // 400 trước 403
  }));

test('audit: PATCH đổi sang giá trị mới ghi đúng trường (assignee về null)', () =>
  withApp([T('t1', { assignee: 'u3' })], async (a) => {
    await a.call('PATCH', '/tasks/t1', withBody('u1', { assignee: null, dueDate: '2026-12-01' }));
    const r = await a.call('GET', '/audit', as('u1'));
    assert.deepEqual(r.json.items[0].changes, ['assignee', 'dueDate']);
  }));
