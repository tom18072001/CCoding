'use strict';
// Bộ test HTTP thật bám chữ của FEATURES.md, dùng seed riêng (độc lập với data/seed.json).
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const users = [
  { id: 'u1', name: 'Admin', role: 'admin', team: null },
  { id: 'u2', name: 'Mgr A', role: 'manager', team: 'A' },
  { id: 'u3', name: 'Mem A1', role: 'member', team: 'A' },
  { id: 'u4', name: 'Mem B1', role: 'member', team: 'B' },
  { id: 'u5', name: 'Mgr B', role: 'manager', team: 'B' },
];
const T = (id, title, status, priority, assignee, team, dueDate, createdAt) => ({ id, title, status, priority, assignee, team, dueDate, createdAt });
const tasks = [
  T('t1', 'Đào tạo nhân sự', 'todo', 2, 'u3', 'A', '2026-03-01', '2026-01-01T00:00:00.000Z'),
  T('t2', 'dac ta yeu cau', 'doing', 1, 'u3', 'A', null, '2026-01-02T00:00:00.000Z'),
  T('t10', 'Đặc tả API', 'done', 2, null, 'A', '2026-02-01', '2026-01-03T00:00:00.000Z'),
  T('t3', 'Báo cáo', 'todo', 3, 'u4', 'B', '2026-03-01', '2026-01-04T00:00:00.000Z'),
  T('t4', 'Đáp án', 'doing', 1, null, 'B', null, '2026-01-05T00:00:00.000Z'),
  T('t5', '=SUM(A1) "x", y', 'todo', 5, 'u3', 'A', null, '2026-01-06T00:00:00.000Z'),
  T('t6', '+1', 'todo', 5, null, 'A', null, '2026-01-07T00:00:00.000Z'),
  T('t7', '@home', 'todo', 5, null, 'A', null, '2026-01-08T00:00:00.000Z'),
  T('t8', '-neg', 'todo', 5, null, 'A', null, '2026-01-09T00:00:00.000Z'),
  T('t9', 'dòng 1\ndòng 2', 'todo', 5, null, 'A', null, '2026-01-10T00:00:00.000Z'),
];
const NOW = '2026-11-01T00:00:00.000Z';
const U = (u) => ({ 'x-user': u });

async function withApp(fn) {
  const app = await start({ seed: { users, tasks }, now: () => new Date(NOW) });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const code = (r, status, c, field) => {
  assert.equal(r.status, status, JSON.stringify(r.json));
  assert.equal(r.json.error.code, c);
  if (field) assert.equal(r.json.error.field, field);
};

test('spec 1: 401 cho mọi route /tasks và /audit', () =>
  withApp(async (a) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit']]) {
      code(await a.call(m, p), 401, 'UNAUTHENTICATED');
      code(await a.call(m, p, { headers: U('zzz') }), 401, 'UNAUTHENTICATED');
    }
    // 401 đứng trước 400 query và 404
    code(await a.call('GET', '/tasks?foo=1'), 401, 'UNAUTHENTICATED');
    code(await a.call('GET', '/tasks/nope'), 401, 'UNAUTHENTICATED');
  }));

test('spec 1: admin làm mọi việc', () =>
  withApp(async (a) => {
    const c = await a.call('POST', '/tasks', { headers: U('u1'), body: { title: 'N', team: 'B' } });
    assert.equal(c.status, 201);
    assert.equal((await a.call('PATCH', `/tasks/${c.json.id}`, { headers: U('u1'), body: { team: 'A', title: 'M' } })).status, 200);
    assert.equal((await a.call('DELETE', `/tasks/${c.json.id}`, { headers: U('u1') })).status, 204);
    assert.equal((await a.call('GET', '/tasks/t4', { headers: U('u1') })).status, 200);
  }));

test('spec 1: manager', () =>
  withApp(async (a) => {
    const m = U('u2');
    assert.equal((await a.call('GET', '/tasks/t4', { headers: m })).status, 200); // đọc nhóm khác
    assert.equal((await a.call('GET', '/tasks', { headers: m })).json.total, tasks.length);
    code(await a.call('POST', '/tasks', { headers: m, body: { title: 'x', team: 'B' } }), 403, 'FORBIDDEN');
    assert.equal((await a.call('POST', '/tasks', { headers: m, body: { title: 'x', team: 'A' } })).status, 201);
    code(await a.call('PATCH', '/tasks/t4', { headers: m, body: { title: 'y' } }), 403, 'FORBIDDEN');
    code(await a.call('PATCH', '/tasks/t1', { headers: m, body: { team: 'B' } }), 403, 'FORBIDDEN');
    // 403 trước validate body
    code(await a.call('PATCH', '/tasks/t4', { headers: m, body: { title: '' } }), 403, 'FORBIDDEN');
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: m, body: { title: 'y', assignee: 'u4' } })).status, 200);
    code(await a.call('PATCH', '/tasks/t1', { headers: m, body: { title: '' } }), 400, 'VALIDATION', 'title');
    code(await a.call('DELETE', '/tasks/t1', { headers: m }), 403, 'FORBIDDEN');
    code(await a.call('GET', '/tasks/nope', { headers: m }), 404, 'NOT_FOUND');
  }));

test('spec 1: member — thấy nhóm mình, 404 nhóm khác, 403 thao tác cấm, thứ tự kiểm tra', () =>
  withApp(async (a) => {
    const m = U('u3');
    assert.ok((await a.call('GET', '/tasks', { headers: m })).json.items.every((t) => t.team === 'A'));
    assert.equal((await a.call('GET', '/tasks/t3', { headers: m })).status, 404);
    assert.equal((await a.call('PATCH', '/tasks/t3', { headers: m, body: { status: 'done' } })).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t3', { headers: m })).status, 404);
    // 404 trước 403 và trước validate
    assert.equal((await a.call('PATCH', '/tasks/t3', { headers: m, body: { title: '' } })).status, 404);
    code(await a.call('POST', '/tasks', { headers: m, body: { title: 'x', team: 'A' } }), 403, 'FORBIDDEN');
    code(await a.call('DELETE', '/tasks/t1', { headers: m }), 403, 'FORBIDDEN');
    // PATCH: không giao cho mình (t10 chưa giao) → 403 dù body sai
    code(await a.call('PATCH', '/tasks/t10', { headers: m, body: { status: 'bad' } }), 403, 'FORBIDDEN');
    // trường khác status (kể cả trùng giá trị cũ) → 403
    code(await a.call('PATCH', '/tasks/t1', { headers: m, body: { status: 'todo', title: 'Đào tạo nhân sự' } }), 403, 'FORBIDDEN');
    code(await a.call('PATCH', '/tasks/t1', { headers: m, body: { title: 'x' } }), 403, 'FORBIDDEN');
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: m, body: { status: 'doing' } })).json.status, 'doing');
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: m, body: { status: 'bad' } })).status, 400);
    // 400 query đứng trước mọi kiểm tra sau (danh sách)
    code(await a.call('GET', '/tasks?x=1', { headers: m }), 400, 'INVALID_QUERY', 'x');
    // team khác → rỗng, không lỗi
    const r = await a.call('GET', '/tasks?team=B', { headers: m });
    assert.equal(r.status, 200);
    assert.deepEqual([r.json.items, r.json.total], [[], 0]);
  }));

test('spec 2: lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (a) => {
    const get = (q, u = 'u1') => a.call('GET', '/tasks' + q, { headers: U(u) });
    const ids = async (q) => (await get(q)).json.items.map((t) => t.id);
    const r0 = (await get('')).json;
    assert.deepEqual([r0.total, r0.page, r0.pageSize], [10, 1, 20]);
    assert.deepEqual((await ids('')).slice(0, 3), ['t1', 't2', 't10']); // createdAt tăng dần
    assert.deepEqual(await ids('?status=doing,done'), ['t2', 't10', 't4']);
    assert.deepEqual(await ids('?assignee=u4'), ['t3']);
    assert.deepEqual(await ids('?assignee=none&team=B'), ['t4']);
    assert.deepEqual(await ids('?q=dac%20ta'), ['t2', 't10']);
    assert.deepEqual(await ids('?q=%C4%90AO%20tao'), ['t1']);
    assert.deepEqual(await ids('?q=dap'), ['t4']);
    assert.equal((await get('?q=')).json.total, 10);
    assert.deepEqual(await ids('?dueBefore=2026-02-01'), ['t10']);
    assert.deepEqual(await ids('?dueBefore=2026-03-01&sort=dueDate'), ['t10', 't1', 't3']);
    // hòa theo id số: t2 < t10
    assert.deepEqual((await ids('?status=todo,doing,done&sort=priority')).slice(0, 3), ['t2', 't4', 't1']);
    assert.deepEqual((await ids('?team=A&sort=-priority')).slice(-3), ['t1', 't10', 't2']); // priority 2,2,1 → hòa t1<t10, rồi t2
    // dueDate null luôn cuối cả hai chiều; hòa theo id số
    const asc = await ids('?sort=dueDate');
    const desc = await ids('?sort=-dueDate');
    assert.deepEqual(asc.slice(0, 3), ['t10', 't1', 't3']);
    assert.deepEqual(desc.slice(0, 3), ['t1', 't3', 't10']);
    assert.deepEqual(asc.slice(3), ['t2', 't4', 't5', 't6', 't7', 't8', 't9']);
    assert.deepEqual(desc.slice(3), asc.slice(3));
    // title dùng localeCompare('vi')
    const byTitle = (await get('?sort=title&pageSize=100')).json.items.map((t) => t.title);
    assert.deepEqual(byTitle, [...byTitle].sort((x, y) => x.localeCompare(y, 'vi')));
    // phân trang
    const p = (await get('?pageSize=4&page=3')).json;
    assert.deepEqual([p.items.length, p.total, p.page, p.pageSize], [2, 10, 3, 4]);
    const over = await get('?page=99');
    assert.equal(over.status, 200);
    assert.deepEqual([over.json.items, over.json.total], [[], 10]);
  }));

test('spec 2: INVALID_QUERY từng tham số và field đầu tiên theo URL', () =>
  withApp(async (a) => {
    const cases = [
      ['?status=x', 'status'], ['?status=todo,x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'],
      ['?dueBefore=26-01-01', 'dueBefore'], ['?sort=foo', 'sort'], ['?sort=-foo', 'sort'], ['?page=1.5', 'page'], ['?page=0', 'page'],
      ['?page=abc', 'page'], ['?pageSize=0', 'pageSize'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'],
      ['?foo=1', 'foo'], ['?team=A&team=B', 'team'], ['?sort=bad&page=0', 'sort'], ['?page=0&sort=bad', 'page'],
      ['?status=todo&foo=1&page=0', 'foo'], ['?page=0&status=x&team=C', 'page'],
    ];
    for (const [q, field] of cases) code(await a.call('GET', '/tasks' + q, { headers: U('u1') }), 400, 'INVALID_QUERY', field);
    assert.equal((await a.call('GET', '/tasks?page=2&pageSize=100', { headers: U('u1') })).status, 200);
  }));

test('spec 3: CSV', () =>
  withApp(async (a) => {
    const r = await a.call('GET', '/tasks/export.csv', { headers: U('u1') });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.equal(r.text.charCodeAt(0), 0xfeff);
    const lines = r.text.slice(1).split('\r\n');
    assert.equal(lines[0], 'id,title,status,priority,assignee,team,dueDate,createdAt');
    assert.equal(lines[lines.length - 1], ''); // CRLF sau dòng cuối
    assert.equal(r.text.replace(/\r\n/g, '').includes('\r'), false);
    assert.ok(r.text.includes('\r\nt5,"\'=SUM(A1) ""x"", y",todo,5,u3,A,,2026-01-06T00:00:00.000Z\r\n'));
    assert.ok(r.text.includes("\r\nt6,'+1,todo,5,,A,,"));
    assert.ok(r.text.includes("\r\nt7,'@home,"));
    assert.ok(r.text.includes("\r\nt8,'-neg,"));
    assert.ok(r.text.includes('\r\nt9,"dòng 1\ndòng 2",todo,5,,A,,'));
    assert.ok(r.text.includes('\r\nt1,Đào tạo nhân sự,todo,2,u3,A,2026-03-01,'));
    // không bị /tasks/:id bắt
    assert.notEqual(r.status, 404);
    // lọc + sắp xếp + quyền
    const f = await a.call('GET', '/tasks/export.csv?status=doing&sort=-createdAt', { headers: U('u1') });
    assert.deepEqual(f.text.slice(1).split('\r\n').slice(1, -1).map((l) => l.split(',')[0]), ['t4', 't2']);
    const mem = await a.call('GET', '/tasks/export.csv', { headers: U('u4') });
    assert.deepEqual(mem.text.slice(1).split('\r\n').slice(1, -1).map((l) => l.split(',')[0]), ['t3', 't4']);
    for (const q of ['?page=1', '?pageSize=5', '?foo=1', '?sort=x']) code(await a.call('GET', '/tasks/export.csv' + q, { headers: U('u1') }), 400, 'INVALID_QUERY');
    code(await a.call('GET', '/tasks/export.csv?page=1'), 401, 'UNAUTHENTICATED');
  }));

test('spec 4: /audit', () =>
  withApp(async (a) => {
    const A = U('u1');
    for (const u of ['u2', 'u3']) code(await a.call('GET', '/audit', { headers: U(u) }), 403, 'FORBIDDEN');
    assert.deepEqual((await a.call('GET', '/audit', { headers: A })).json, { items: [] });
    const c = await a.call('POST', '/tasks', { headers: A, body: { title: 'N', team: 'A', priority: 2 } });
    const id = c.json.id;
    await a.call('PATCH', `/tasks/${id}`, { headers: A, body: { title: 'N', status: 'done', priority: 3 } }); // title không đổi
    await a.call('PATCH', `/tasks/${id}`, { headers: A, body: { title: '' } }); // lỗi
    await a.call('PATCH', '/tasks/nope', { headers: A, body: { title: 'x' } }); // 404
    await a.call('POST', '/tasks', { headers: U('u3'), body: { title: 'x', team: 'A' } }); // 403
    await a.call('DELETE', `/tasks/${id}`, { headers: A });
    await a.call('DELETE', `/tasks/${id}`, { headers: A }); // 404
    const r = await a.call('GET', '/audit', { headers: A });
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.taskId, e.changes]), [
      [3, 'delete', id, []], [2, 'update', id, ['priority', 'status']], [1, 'create', id, ['priority', 'team', 'title']],
    ]);
    assert.ok(r.json.items.every((e) => e.at === NOW && e.userId === 'u1'));
    await a.call('PATCH', '/tasks/t1', { headers: U('u2'), body: { title: 'khác' } });
    const f = await a.call('GET', `/audit?taskId=${id}`, { headers: A });
    assert.equal(f.json.items.length, 3);
    assert.deepEqual((await a.call('GET', '/audit?taskId=t1', { headers: A })).json.items.map((e) => [e.seq, e.userId]), [[4, 'u2']]);
    assert.equal((await a.call('GET', '/audit?taskId=zzz', { headers: A })).json.items.length, 0);
    code(await a.call('GET', '/audit?x=1', { headers: A }), 400, 'INVALID_QUERY');
    // 401 → 400 → 403: member + query sai → 400 đứng trước 403
    code(await a.call('GET', '/audit?x=1', { headers: U('u3') }), 400, 'INVALID_QUERY');
  }));
