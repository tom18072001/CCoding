'use strict';
// Bộ test HTTP độc lập, viết theo FEATURES.md (không dựa vào cài đặt). Dùng seed riêng.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const SEED = {
  users: [
    { id: 'adm', name: 'Admin', role: 'admin', team: null },
    { id: 'mgA', name: 'MA', role: 'manager', team: 'A' },
    { id: 'mgB', name: 'MB', role: 'manager', team: 'B' },
    { id: 'memA', name: 'A1', role: 'member', team: 'A' },
    { id: 'memA2', name: 'A2', role: 'member', team: 'A' },
    { id: 'memB', name: 'B1', role: 'member', team: 'B' },
  ],
  tasks: [
    { id: 't1', title: 'Đào tạo nhân viên', status: 'todo', priority: 2, assignee: 'memA', team: 'A', dueDate: '2026-03-01', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 't2', title: 'dao tao lại', status: 'doing', priority: 1, assignee: 'memA2', team: 'A', dueDate: null, createdAt: '2026-01-02T00:00:00.000Z' },
    { id: 't10', title: 'ĐẶC TẢ yêu cầu', status: 'done', priority: 2, assignee: null, team: 'B', dueDate: '2026-03-01', createdAt: '2026-01-03T00:00:00.000Z' },
    { id: 't3', title: 'Đặc tả API', status: 'todo', priority: 2, assignee: 'memB', team: 'B', dueDate: '2026-02-01', createdAt: '2026-01-03T00:00:00.000Z' },
    { id: 't4', title: '=1+1, "x"', status: 'todo', priority: 3, assignee: 'memA', team: 'A', dueDate: null, createdAt: '2026-01-05T00:00:00.000Z' },
    { id: 't5', title: '@home\tvà+cộng', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: '2026-12-31', createdAt: '2026-01-06T00:00:00.000Z' },
    { id: 't6', title: 'dòng 1\r\ndòng 2', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-07T00:00:00.000Z' },
  ],
};
const NOW = new Date('2026-06-01T10:00:00Z');

async function withApp(fn) {
  const app = await start({ seed: SEED, now: () => NOW });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const as = (id) => ({ headers: { 'x-user': id } });
const wb = (id, body) => ({ body, headers: { 'x-user': id } });
const ids = (r) => r.json.items.map((t) => t.id);

test('thứ tự lỗi: 401 → 400 → 404 → 403 → validate', () =>
  withApp(async (app) => {
    // 401 trước tất cả
    assert.equal((await app.call('GET', '/tasks?foo=1')).status, 401);
    assert.equal((await app.call('GET', '/tasks?foo=1', as('ghost'))).json.error.code, 'UNAUTHENTICATED');
    assert.equal((await app.call('PATCH', '/tasks/zzz', { body: { title: '' } })).status, 401);
    assert.equal((await app.call('POST', '/tasks', { body: { title: '' } })).status, 401);
    assert.equal((await app.call('DELETE', '/tasks/t1')).status, 401);
    // 400 tham số trước 404
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('memA'))).json.error.code, 'INVALID_QUERY');
    // 404 trước 403: member sửa task nhóm khác / không tồn tại
    assert.equal((await app.call('PATCH', '/tasks/t3', wb('memA', { title: '' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t3', as('memA'))).status, 404);
    assert.equal((await app.call('GET', '/tasks/t3', as('memA'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/nope', as('mgA'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/nope', wb('adm', { title: 'x' }))).status, 404);
    // 403 trước validate
    assert.equal((await app.call('PATCH', '/tasks/t3', wb('mgA', { title: '' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', wb('memA', { status: 'bad' }))).status, 403); // không giao cho mình
    assert.equal((await app.call('PATCH', '/tasks/t1', wb('memA', { title: '' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', wb('memA', { title: '' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', wb('mgA', { title: '', team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', wb('mgA', { team: 'B', title: '' }))).status, 403);
    // validate cuối cùng
    const v = await app.call('POST', '/tasks', wb('adm', { title: '', team: 'A' }));
    assert.equal(v.status, 400);
    assert.equal(v.json.error.field, 'title');
    assert.equal((await app.call('PATCH', '/tasks/t1', wb('memA', { status: 'bad' }))).status, 400);
    // 403 body không gồm lỗi
    assert.equal((await app.call('DELETE', '/tasks/t1', as('mgA'))).json.error.code, 'FORBIDDEN');
  }));

test('quyền theo vai trò', () =>
  withApp(async (app) => {
    // admin
    assert.equal((await app.call('POST', '/tasks', wb('adm', { title: 'n', team: 'B' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t3', wb('adm', { team: 'A' }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t3', as('adm'))).status, 204);
    // manager B: đọc mọi nhóm, sửa nhóm mình, không chuyển nhóm, không xóa
    assert.equal((await app.call('GET', '/tasks', as('mgB'))).json.total, 7);
    assert.equal((await app.call('GET', '/tasks/t1', as('mgB'))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', wb('mgB', { status: 'done' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t10', wb('mgB', { team: 'A' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t10', wb('mgB', { title: 'Mới', priority: 3, assignee: 'memB' }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t10', as('mgB'))).status, 403);
    // member
    assert.equal((await app.call('PATCH', '/tasks/t1', wb('memA', { status: 'doing' }))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', wb('memA', { status: 'doing', title: 'Đào tạo nhân viên' }))).status, 403); // trường khác dù trùng
    assert.equal((await app.call('PATCH', '/tasks/t1', wb('memA2', { status: 'done' }))).status, 403); // không giao cho mình
    assert.equal((await app.call('DELETE', '/tasks/t1', as('memA'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', wb('memA', { title: 'x', team: 'A' }))).status, 403);
    // member: danh sách tự lọc nhóm; team khác → rỗng, không lỗi
    const l = await app.call('GET', '/tasks', as('memB'));
    assert.deepEqual(ids(l), ['t10', 't11']);
    const o = await app.call('GET', '/tasks?team=A', as('memB'));
    assert.equal(o.status, 200);
    assert.deepEqual([o.json.items, o.json.total], [[], 0]);
    // /audit chỉ admin
    assert.equal((await app.call('GET', '/audit', as('mgA'))).status, 403);
    assert.equal((await app.call('GET', '/audit', as('memA'))).json.error.code, 'FORBIDDEN');
  }));

test('tham số lạ / lặp / không hợp lệ → 400 field đầu tiên theo URL', () =>
  withApp(async (app) => {
    const cases = [
      ['?foo=1', 'foo'], ['?team=A&team=A', 'team'], ['?q=a&q=b', 'q'], ['?sort=title&sort=title', 'sort'],
      ['?page=1&page=1', 'page'], ['?status=todo&status=doing', 'status'],
      ['?status=', 'status'], ['?status=todo,,doing', 'status'], ['?status=TODO', 'status'], ['?team=a', 'team'], ['?team=', 'team'],
      ['?dueBefore=2026-02-30', 'dueBefore'], ['?dueBefore=2026-13-01', 'dueBefore'], ['?dueBefore=20260101', 'dueBefore'], ['?dueBefore=2026-1-1', 'dueBefore'],
      ['?sort=-id', 'sort'], ['?sort=--title', 'sort'], ['?sort=', 'sort'], ['?sort=status', 'sort'],
      ['?page=-1', 'page'], ['?page=', 'page'], ['?page=1e1', 'page'], ['?page=%201', 'page'], ['?pageSize=0', 'pageSize'], ['?pageSize=101', 'pageSize'], ['?pageSize=2.0', 'pageSize'],
      ['?foo=1&page=0', 'foo'], ['?page=0&foo=1', 'page'], ['?pageSize=0&team=Z&sort=x', 'pageSize'], ['?sort=x&pageSize=0', 'sort'],
      ['?team=Z&team=Z', 'team'], ['?page=1&foo=1&page=0', 'foo'],
    ];
    for (const [q, field] of cases) {
      const r = await app.call('GET', '/tasks' + q, as('adm'));
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY', q);
      assert.equal(r.json.error.field, field, q);
    }
    // hợp lệ
    for (const q of ['?q=', '?assignee=none', '?assignee=ghost', '?pageSize=100', '?pageSize=1&page=1', '?status=todo,doing,done', '?dueBefore=2028-02-29']) {
      assert.equal((await app.call('GET', '/tasks' + q, as('adm'))).status, 200, q);
    }
    assert.equal((await app.call('GET', '/tasks?dueBefore=2027-02-29', as('adm'))).status, 400);
  }));

test('phân trang biên', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks?pageSize=3&page=1', as('adm'));
    assert.deepEqual([r.json.total, r.json.page, r.json.pageSize, r.json.items.length], [7, 1, 3, 3]);
    const last = await app.call('GET', '/tasks?pageSize=3&page=3', as('adm'));
    assert.deepEqual(ids(last), ['t6']);
    const beyond = await app.call('GET', '/tasks?pageSize=3&page=4', as('adm'));
    assert.equal(beyond.status, 200);
    assert.deepEqual([beyond.json.items, beyond.json.total, beyond.json.page], [[], 7, 4]);
    const big = await app.call('GET', '/tasks?page=999999', as('adm'));
    assert.deepEqual([big.status, big.json.items.length, big.json.total], [200, 0, 7]);
    const def = await app.call('GET', '/tasks', as('adm'));
    assert.deepEqual([def.json.page, def.json.pageSize], [1, 20]);
    assert.equal((await app.call('GET', '/tasks?pageSize=100', as('adm'))).json.pageSize, 100);
    // total là số khớp bộ lọc, không phải kích thước trang
    const f = await app.call('GET', '/tasks?status=todo&pageSize=2', as('adm'));
    assert.deepEqual([f.json.total, f.json.items.length], [5, 2]);
  }));

test('lọc: status, assignee, team, dueBefore', () =>
  withApp(async (app) => {
    const g = (q, u = 'adm') => app.call('GET', '/tasks' + q, as(u));
    assert.deepEqual(ids(await g('?status=doing,done')), ['t2', 't10']);
    assert.deepEqual(ids(await g('?assignee=none')), ['t10', 't5', 't6']);
    assert.deepEqual(ids(await g('?assignee=memA')), ['t1', 't4']);
    assert.deepEqual(ids(await g('?team=B&status=todo')), ['t3']);
    // dueBefore bao gồm đúng ngày, loại null
    assert.deepEqual(ids(await g('?dueBefore=2026-03-01&sort=dueDate')), ['t3', 't1', 't10']);
    assert.deepEqual(ids(await g('?dueBefore=2026-02-28')), ['t3']);
    assert.deepEqual(ids(await g('?dueBefore=2000-01-01')), []);
  }));

test('q: không phân biệt hoa/thường và dấu tiếng Việt', () =>
  withApp(async (app) => {
    const g = async (q) => ids(await app.call('GET', '/tasks?sort=createdAt&q=' + encodeURIComponent(q), as('adm')));
    assert.deepEqual(await g('dao tao'), ['t1', 't2']);
    assert.deepEqual(await g('ĐÀO TẠO'), ['t1', 't2']);
    assert.deepEqual(await g('đào'), ['t1', 't2']);
    assert.deepEqual(await g('dac ta'), ['t3', 't10']);
    assert.deepEqual(await g('ĐẶC'), ['t3', 't10']);
    assert.deepEqual(await g('đặc tả api'), ['t3']);
    assert.deepEqual(await g('nhan vien'), ['t1']);
    assert.deepEqual(await g('cong'), ['t5']);
    assert.deepEqual(await g('khong-co'), []);
    assert.equal((await app.call('GET', '/tasks?q=', as('adm'))).json.total, 7);
    // NFD đầu vào (dấu kết hợp) cũng khớp
    assert.deepEqual(await g('dào tạo'.normalize('NFD')), ['t1', 't2']);
  }));

test('sắp xếp: mặc định, ổn định, null cuối, id theo số', () =>
  withApp(async (app) => {
    const g = async (q) => ids(await app.call('GET', '/tasks' + q, as('adm')));
    // mặc định createdAt tăng; t10 và t3 cùng createdAt → t3 < t10 theo số
    assert.deepEqual(await g(''), ['t1', 't2', 't3', 't10', 't4', 't5', 't6']);
    // giảm dần: hòa vẫn theo id tăng
    assert.deepEqual(await g('?sort=-createdAt'), ['t6', 't5', 't4', 't3', 't10', 't2', 't1']);
    // priority: hòa theo id số tăng, cả hai chiều
    assert.deepEqual(await g('?sort=priority'), ['t2', 't5', 't6', 't1', 't3', 't10', 't4']);
    assert.deepEqual(await g('?sort=-priority'), ['t4', 't1', 't3', 't10', 't2', 't5', 't6']);
    // dueDate: null luôn cuối
    assert.deepEqual(await g('?sort=dueDate'), ['t3', 't1', 't10', 't5', 't2', 't4', 't6']);
    assert.deepEqual(await g('?sort=-dueDate'), ['t5', 't1', 't10', 't3', 't2', 't4', 't6']);
    // title: localeCompare 'vi'
    const expected = [...SEED.tasks]
      .sort((a, b) => a.title.localeCompare(b.title, 'vi') || (Number(a.id.slice(1)) - Number(b.id.slice(1))))
      .map((t) => t.id);
    assert.deepEqual(await g('?sort=title'), expected);
  }));

test('xuất CSV: header, BOM, CRLF, escape, chống công thức', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv', as('adm'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(r.text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(!r.text.endsWith('\r\n\r\n'));
    assert.ok(r.text.includes('\r\nt1,Đào tạo nhân viên,todo,2,memA,A,2026-03-01,2026-01-01T00:00:00.000Z\r\n'));
    // null → ô trống
    assert.ok(r.text.includes('\r\nt2,dao tao lại,doing,1,memA2,A,,2026-01-02T00:00:00.000Z\r\n'));
    assert.ok(r.text.includes('\r\nt10,ĐẶC TẢ yêu cầu,done,2,,B,2026-03-01,'));
    // "=1+1, "x"" → thêm ' → bọc ngoặc + nhân đôi "
    assert.ok(r.text.includes('\r\nt4,"\'=1+1, ""x""",todo,3,memA,A,,'));
    // bắt đầu bằng @ → thêm '; chứa tab nhưng không phải \r \n , " nên không bọc
    assert.ok(r.text.includes('\r\nt5,\'@home\tvà+cộng,todo,1,,A,2026-12-31,'));
    // xuống dòng CRLF trong trường → bọc ngoặc
    assert.ok(r.text.includes('\r\nt6,"dòng 1\r\ndòng 2",todo,1,,A,,'));
    // thứ tự sort và bộ lọc áp dụng
    const s = await app.call('GET', '/tasks/export.csv?status=todo&sort=-priority&q=dao', as('adm'));
    assert.deepEqual(s.text.split('\r\n').slice(1, -1).map((l) => l.split(',')[0]), ['t1']);
    // member chỉ thấy nhóm mình
    const m = await app.call('GET', '/tasks/export.csv', as('memB'));
    const lines = m.text.split('\r\n');
    assert.equal(lines.length, 4);
    assert.ok(lines[1].startsWith('t3,') && lines[2].startsWith('t10,'));
    // chỉ có header khi rỗng
    const e = await app.call('GET', '/tasks/export.csv?team=A', as('memB'));
    assert.equal(e.text, '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n');
    // không phân trang
    for (const q of ['?page=1', '?pageSize=10', '?pageSize=0']) {
      const x = await app.call('GET', '/tasks/export.csv' + q, as('adm'));
      assert.equal(x.status, 400, q);
      assert.equal(x.json.error.code, 'INVALID_QUERY');
    }
    assert.equal((await app.call('GET', '/tasks/export.csv?foo=1', as('adm'))).json.error.field, 'foo');
    // /tasks/export.csv không bị hiểu là id
    assert.equal((await app.call('GET', '/tasks/export.csv', as('mgA'))).status, 200);
  }));

test('nhật ký: POST/PATCH/DELETE, changes, seq, at, lỗi không ghi', () =>
  withApp(async (app) => {
    const c = await app.call('POST', '/tasks', wb('mgA', { title: 'Mới', team: 'A', priority: 2, status: 'todo' }));
    assert.equal(c.status, 201);
    const id = c.json.id;
    await app.call('PATCH', `/tasks/${id}`, wb('mgA', { title: 'Mới', priority: 3, status: 'doing' })); // title không đổi
    await app.call('PATCH', `/tasks/${id}`, wb('mgA', { priority: 'bad' })); // 400
    await app.call('PATCH', '/tasks/t3', wb('mgA', { title: 'x' })); // 403
    await app.call('PATCH', '/tasks/nope', wb('mgA', { title: 'x' })); // 404
    await app.call('POST', '/tasks', wb('memA', { title: 'x', team: 'A' })); // 403
    await app.call('DELETE', `/tasks/${id}`, as('mgA')); // 403
    await app.call('PATCH', '/tasks/t1', wb('memA', { status: 'done' })); // member update
    await app.call('DELETE', `/tasks/${id}`, as('adm'));
    await app.call('DELETE', `/tasks/${id}`, as('adm')); // 404: không ghi
    const r = await app.call('GET', '/audit', as('adm'));
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json), ['items']);
    assert.deepEqual(
      r.json.items.map((e) => [e.seq, e.action, e.taskId, e.userId, e.changes]),
      [
        [4, 'delete', id, 'adm', []],
        [3, 'update', 't1', 'memA', ['status']],
        [2, 'update', id, 'mgA', ['priority', 'status']],
        [1, 'create', id, 'mgA', ['priority', 'status', 'team', 'title']],
      ],
    );
    for (const e of r.json.items) assert.equal(e.at, NOW.toISOString());
    assert.deepEqual(Object.keys(r.json.items[0]).sort(), ['action', 'at', 'changes', 'seq', 'taskId', 'userId']);
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('adm'))).json.items.length, 1);
    assert.equal((await app.call('GET', `/audit?taskId=${id}`, as('adm'))).json.items.length, 3);
    assert.equal((await app.call('GET', '/audit?taskId=zzz', as('adm'))).json.items.length, 0);
    const bad = await app.call('GET', '/audit?x=1', as('adm'));
    assert.deepEqual([bad.status, bad.json.error.code], [400, 'INVALID_QUERY']);
    assert.equal((await app.call('GET', '/audit?taskId=a&taskId=b', as('adm'))).status, 400);
    // thứ tự lỗi trên /audit
    assert.equal((await app.call('GET', '/audit?x=1')).status, 401);
    assert.equal((await app.call('GET', '/audit?x=1', as('mgA'))).status, 400);
    assert.equal((await app.call('GET', '/audit', as('mgA'))).status, 403);
  }));
