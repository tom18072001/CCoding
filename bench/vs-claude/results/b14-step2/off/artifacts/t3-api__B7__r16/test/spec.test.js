'use strict';
// Bộ test hộp đen theo FEATURES.md — chỉ gọi HTTP thật, seed tự định nghĩa.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const T = (id, o) => ({ id, title: id, status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const seed = () => ({
  users: [
    { id: 'adm', name: 'Admin', role: 'admin', team: null },
    { id: 'mgA', name: 'MA', role: 'manager', team: 'A' },
    { id: 'mgB', name: 'MB', role: 'manager', team: 'B' },
    { id: 'm1', name: 'M1', role: 'member', team: 'A' },
    { id: 'm2', name: 'M2', role: 'member', team: 'A' },
    { id: 'mb', name: 'MB1', role: 'member', team: 'B' },
  ],
  tasks: [
    T('t1', { title: 'Đào tạo nhân viên', status: 'todo', priority: 2, assignee: 'm1', dueDate: '2026-03-10', createdAt: '2026-01-03T00:00:00.000Z' }),
    T('t2', { title: 'dac ta yeu cau', status: 'doing', priority: 1, assignee: 'm2', dueDate: null, createdAt: '2026-01-02T00:00:00.000Z' }),
    T('t10', { title: 'Đặc tả kỹ thuật', status: 'done', priority: 3, assignee: null, team: 'B', dueDate: '2026-03-10', createdAt: '2026-01-02T00:00:00.000Z' }),
    T('t3', { title: 'Báo cáo', status: 'todo', priority: 3, assignee: 'mb', team: 'B', dueDate: '2026-02-01', createdAt: '2026-01-05T00:00:00.000Z' }),
    T('t4', { title: 'Zebra', status: 'doing', priority: 2, assignee: 'm1', team: 'A', dueDate: '2026-04-01', createdAt: '2026-01-04T00:00:00.000Z' }),
    T('t5', { title: 'Ăn trưa', status: 'done', priority: 1, assignee: 'mb', team: 'B', dueDate: null, createdAt: '2026-01-06T00:00:00.000Z' }),
    T('t6', { title: 'Đá bóng', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: '2026-01-15', createdAt: '2026-01-07T00:00:00.000Z' }),
  ],
});
const NOW = '2026-11-01T00:00:00.000Z';
const as = (id) => ({ headers: { 'x-user': id } });
const wb = (id, body) => ({ headers: { 'x-user': id }, body });

async function withApp(fn, extra = {}) {
  const app = await start({ seed: seed(), now: () => new Date(NOW), ...extra });
  try { await fn(app); } finally { await app.close(); }
}
const ids = async (app, qs, u = 'adm') => {
  const r = await app.call('GET', '/tasks' + qs, as(u));
  assert.equal(r.status, 200, qs + ' ' + r.text);
  return r.json.items.map((t) => t.id);
};
const badQ = async (app, path, u = 'adm') => {
  const r = await app.call('GET', path, as(u));
  assert.equal(r.status, 400, path);
  assert.equal(r.json.error.code, 'INVALID_QUERY', path);
  return r.json.error.field;
};
const rawCsv = async (app, qs, u = 'adm') => {
  const res = await fetch(app.base + '/tasks/export.csv' + qs, as(u));
  return { res, buf: Buffer.from(await res.arrayBuffer()) };
};

// ───────── 1. Xác thực & phân quyền
test('401: thiếu/sai X-User trên mọi route, 401 đi trước 400/404', () => withApp(async (app) => {
  for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['GET', '/tasks?foo=1'], ['GET', '/tasks/nope']]) {
    const r = await app.call(m, p);
    assert.equal(r.status, 401, `${m} ${p}`);
    assert.equal(r.json.error.code, 'UNAUTHENTICATED');
  }
  assert.equal((await app.call('GET', '/tasks', as('ghost'))).status, 401);
}));

test('admin làm mọi việc', () => withApp(async (app) => {
  const c = await app.call('POST', '/tasks', wb('adm', { title: 'X', team: 'B' }));
  assert.equal(c.status, 201);
  assert.equal((await app.call('PATCH', '/tasks/t1', wb('adm', { team: 'B', title: 'Y' }))).status, 200);
  assert.equal((await app.call('DELETE', '/tasks/t1', as('adm'))).status, 204);
}));

test('manager: đọc mọi nhóm, tạo/sửa chỉ nhóm mình, không chuyển nhóm, không xóa', () => withApp(async (app) => {
  assert.equal((await app.call('GET', '/tasks', as('mgA'))).json.total, 7);
  assert.equal((await app.call('GET', '/tasks/t3', as('mgA'))).status, 200);
  const f = async (m, p, b) => { const r = await app.call(m, p, wb('mgA', b)); return r; };
  const r403 = await f('POST', '/tasks', { title: 'x', team: 'B' });
  assert.equal(r403.status, 403); assert.equal(r403.json.error.code, 'FORBIDDEN');
  assert.equal((await f('POST', '/tasks', { title: 'x', team: 'A' })).status, 201);
  assert.equal((await f('PATCH', '/tasks/t3', { title: 'y' })).status, 403);
  assert.equal((await f('PATCH', '/tasks/t1', { team: 'B' })).status, 403);
  assert.equal((await f('PATCH', '/tasks/t1', { title: 'y', priority: 3, assignee: 'm2', status: 'done' })).status, 200);
  assert.equal((await app.call('DELETE', '/tasks/t1', as('mgA'))).status, 403);
  assert.equal((await app.call('DELETE', '/tasks/nope', as('mgA'))).status, 404);
}));

test('member: chỉ thấy nhóm mình; 404 nhóm khác; 403 tạo/xóa; sửa status việc của mình', () => withApp(async (app) => {
  const l = await app.call('GET', '/tasks', as('m1'));
  assert.equal(l.json.total, 4);
  assert.ok(l.json.items.every((t) => t.team === 'A'));
  assert.deepEqual(await ids(app, '?team=B', 'm1'), []);
  for (const m of ['GET', 'DELETE']) assert.equal((await app.call(m, '/tasks/t3', as('m1'))).status, 404);
  assert.equal((await app.call('PATCH', '/tasks/t3', wb('m1', { status: 'done' }))).status, 404);
  assert.equal((await app.call('POST', '/tasks', wb('m1', { title: 'x', team: 'A' }))).status, 403);
  assert.equal((await app.call('DELETE', '/tasks/t1', as('m1'))).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t2', wb('m1', { status: 'done' }))).status, 403); // giao cho m2
  assert.equal((await app.call('PATCH', '/tasks/t1', wb('m1', { status: 'done', priority: 2 }))).status, 403); // trùng giá trị cũ
  assert.equal((await app.call('PATCH', '/tasks/t1', wb('m1', { title: 'Đào tạo nhân viên' }))).status, 403);
  // 403 đi trước 400 validate
  assert.equal((await app.call('PATCH', '/tasks/t1', wb('m1', { status: 'bad', title: 'x' }))).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', wb('m1', { status: 'bad' }))).status, 400);
  const ok = await app.call('PATCH', '/tasks/t1', wb('m1', { status: 'done' }));
  assert.equal(ok.status, 200); assert.equal(ok.json.status, 'done');
}));

test('thứ tự kiểm tra: 400 query trước 404; 404 trước 403 trước 400 body', () => withApp(async (app) => {
  assert.equal(await badQ(app, '/tasks/export.csv?foo=1'), 'foo');
  assert.equal((await app.call('DELETE', '/tasks/nope', as('m1'))).status, 404);
  assert.equal((await app.call('POST', '/tasks', wb('m1', { title: '' }))).status, 403);
  const r = await app.call('POST', '/tasks', wb('adm', { title: '', team: 'A' }));
  assert.equal(r.status, 400); assert.equal(r.json.error.field, 'title');
  assert.equal((await app.call('PATCH', '/tasks/t3', wb('mgA', { title: '' }))).status, 403);
}));

// ───────── 2. Danh sách
test('GET /tasks: dạng kết quả mặc định', () => withApp(async (app) => {
  const r = await app.call('GET', '/tasks', as('adm'));
  assert.equal(r.status, 200);
  assert.equal(r.json.total, 7); assert.equal(r.json.page, 1); assert.equal(r.json.pageSize, 20);
  // mặc định createdAt tăng dần, hòa theo id số: t2 < t10
  assert.deepEqual(r.json.items.map((t) => t.id), ['t2', 't10', 't1', 't4', 't3', 't5', 't6']);
}));

test('lọc status/assignee/team/dueBefore', () => withApp(async (app) => {
  assert.deepEqual(await ids(app, '?status=todo,doing&sort=title'), await ids(app, '?status=doing,todo&sort=title'));
  assert.deepEqual(new Set(await ids(app, '?status=done')), new Set(['t10', 't5']));
  assert.deepEqual(new Set(await ids(app, '?assignee=none')), new Set(['t10', 't6']));
  assert.deepEqual(new Set(await ids(app, '?assignee=m1')), new Set(['t1', 't4']));
  assert.deepEqual(new Set(await ids(app, '?team=B')), new Set(['t10', 't3', 't5']));
  assert.deepEqual(await ids(app, '?dueBefore=2026-03-10&sort=dueDate'), ['t6', 't3', 't1', 't10']); // biên ≤, bỏ null
  assert.deepEqual(await ids(app, '?dueBefore=2026-03-09&sort=dueDate'), ['t6', 't3']);
  assert.deepEqual(await ids(app, '?status=todo&team=A&assignee=none'), ['t6']);
}));

test('q: không phân biệt hoa/thường, dấu, đ→d, chuỗi con; q rỗng = không lọc', () => withApp(async (app) => {
  assert.deepEqual(new Set(await ids(app, '?q=dac ta')), new Set(['t2', 't10']));
  assert.deepEqual(new Set(await ids(app, '?q=ĐẶC TẢ')), new Set(['t2', 't10']));
  assert.deepEqual(await ids(app, '?q=dao tao'), ['t1']);
  assert.deepEqual(await ids(app, '?q=%C4%90%C3%80O'), ['t1']);
  assert.deepEqual(await ids(app, '?q=da%20bong'), ['t6']);
  assert.deepEqual(await ids(app, '?q=zEB'), ['t4']);
  assert.deepEqual(await ids(app, '?q=khongco'), []);
  assert.equal((await ids(app, '?q=')).length, 7);
}));

test('sort: mọi trường, chiều, hòa theo id số, dueDate null cuối', () => withApp(async (app) => {
  assert.deepEqual(await ids(app, '?sort=createdAt'), ['t2', 't10', 't1', 't4', 't3', 't5', 't6']);
  assert.deepEqual(await ids(app, '?sort=-createdAt'), ['t6', 't5', 't3', 't4', 't1', 't2', 't10']); // hòa vẫn t2<t10
  assert.deepEqual(await ids(app, '?sort=dueDate'), ['t6', 't3', 't1', 't10', 't4', 't2', 't5']);
  assert.deepEqual(await ids(app, '?sort=-dueDate'), ['t4', 't1', 't10', 't3', 't6', 't2', 't5']);
  assert.deepEqual(await ids(app, '?sort=priority'), ['t2', 't5', 't6', 't1', 't4', 't3', 't10']);
  assert.deepEqual(await ids(app, '?sort=-priority'), ['t3', 't10', 't1', 't4', 't2', 't5', 't6']);
  // title theo locale vi: Ăn trưa < Báo cáo < Đá bóng ... Zebra cuối
  const titles = (await app.call('GET', '/tasks?sort=title', as('adm'))).json.items.map((t) => t.title);
  assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b, 'vi')));
  const rt = (await app.call('GET', '/tasks?sort=-title', as('adm'))).json.items.map((t) => t.title);
  assert.deepEqual(rt, [...titles].reverse());
}));

test('phân trang: biên và vượt trang', () => withApp(async (app) => {
  const p = await app.call('GET', '/tasks?pageSize=3&page=3', as('adm'));
  assert.equal(p.json.items.length, 1); assert.equal(p.json.total, 7);
  assert.equal(p.json.page, 3); assert.equal(p.json.pageSize, 3);
  const b = await app.call('GET', '/tasks?page=99', as('adm'));
  assert.equal(b.status, 200); assert.deepEqual(b.json.items, []); assert.equal(b.json.total, 7);
  assert.equal((await ids(app, '?pageSize=100')).length, 7);
  assert.equal((await ids(app, '?pageSize=1')).length, 1);
  // total tính theo bộ lọc
  assert.equal((await app.call('GET', '/tasks?status=done&pageSize=1', as('adm'))).json.total, 2);
  // member: total theo nhóm mình
  assert.equal((await app.call('GET', '/tasks?pageSize=1', as('mb'))).json.total, 3);
}));

test('INVALID_QUERY: giá trị sai, tham số lạ, trùng lặp, thứ tự URL', () => withApp(async (app) => {
  for (const [q, f] of [['status=x', 'status'], ['status=', 'status'], ['team=C', 'team'], ['team=a', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2026-2-3', 'dueBefore'], ['dueBefore=2025-02-29', 'dueBefore'], ['sort=foo', 'sort'], ['sort=--title', 'sort'], ['page=1.5', 'page'], ['page=0', 'page'], ['page=abc', 'page'], ['page=-1', 'page'], ['pageSize=0', 'pageSize'], ['pageSize=101', 'pageSize'], ['pageSize=1.5', 'pageSize'], ['foo=1', 'foo'], ['team=A&team=B', 'team'], ['q=a&q=b', 'q'], ['sort=x&page=0', 'sort'], ['page=0&sort=x', 'page'], ['foo=1&page=0', 'foo'], ['page=0&foo=1', 'page']]) {
    assert.equal(await badQ(app, '/tasks?' + q), f, q);
  }
  assert.equal((await app.call('GET', '/tasks?dueBefore=2028-02-29', as('adm'))).status, 200); // năm nhuận
}));

// ───────── 3. CSV
test('CSV: header HTTP, BOM, header, CRLF, member lọc nhóm, không phân trang', () => withApp(async (app) => {
  const { res, buf } = await rawCsv(app, '?team=A&sort=dueDate');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const s = buf.toString('utf8').slice(1);
  assert.ok(s.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
  assert.ok(s.endsWith('\r\n') && !s.endsWith('\r\n\r\n'));
  assert.equal(s.split('\r\n').length, 1 + 4 + 1);
  assert.ok(!s.replace(/\r\n/g, '').includes('\n'));
  assert.ok(s.includes('\r\nt6,Đá bóng,todo,1,,A,2026-01-15,2026-01-07T00:00:00.000Z\r\n')); // null → ô trống
  const m = (await rawCsv(app, '', 'mb')).buf.toString('utf8');
  assert.equal(m.split('\r\n').length, 1 + 3 + 1);
  for (const q of ['?page=1', '?pageSize=5', '?x=1']) assert.equal(await badQ(app, '/tasks/export.csv' + q), q.slice(1, q.indexOf('=')));
  assert.equal((await app.call('GET', '/tasks/export.csv?status=zzz', as('adm'))).json.error.field, 'status');
}));

test('CSV: RFC 4180 và chống chèn công thức', () => withApp(async (app) => {
  const titles = ['a,b', 'say "hi"', 'dòng1\ndòng2', 'cr\rx', '=SUM(A1)', '+1', '-2', '@x', '\tTab', '\rCR', '=a,"b"', 'plain', ' =lead-space', 'x=1'];
  for (const title of titles) {
    const c = await app.call('POST', '/tasks', wb('adm', { title, team: 'A', priority: 3 }));
    assert.equal(c.status, 201, title);
  }
  const text = (await rawCsv(app, '')).buf.toString('utf8');
  const has = (frag) => assert.ok(text.includes(frag), JSON.stringify(frag));
  has(',"a,b",'); has(',"say ""hi""",'); has(',"dòng1\ndòng2",'); has(',"cr\rx",');
  has(',\'=SUM(A1),'); has(',\'+1,'); has(',\'-2,'); has(',\'@x,');
  has(',\'\tTab,'); // tab đầu: thêm '; không cần bọc ngoặc kép
  has(',"\'\rCR",'); // \r đầu: thêm ' rồi bọc ngoặc kép
  has(',"\'=a,""b""",');
  has(',plain,'); has(', =lead-space,'); has(',x=1,');
  assert.ok(/,2026-11-01T00:00:00\.000Z\r\n/.test(text));
  // số giữ nguyên, không tiền tố
  assert.ok(/,todo,3,,A,,2026-11-01/.test(text));
  // assignee âm-giống: số không bị prefix
  const neg = await app.call('POST', '/tasks', wb('adm', { title: 'neg', team: 'A', priority: 1 }));
  assert.equal(neg.status, 201);
}));

// ───────── 4. Nhật ký
test('audit: seq từ 1, at, userId, action, changes sắp a→z, lỗi không ghi', () => withApp(async (app) => {
  assert.deepEqual((await app.call('GET', '/audit', as('adm'))).json, { items: [] });
  await app.call('POST', '/tasks', wb('adm', { title: 'N', team: 'A', priority: 2 }));            // seq1 create t8
  await app.call('POST', '/tasks', wb('adm', { title: '', team: 'A' }));                          // lỗi
  await app.call('PATCH', '/tasks/t1', wb('mgA', { title: 'Mới', status: 'todo', priority: 2, assignee: 'm2' })); // seq2: title, assignee đổi; status/priority không đổi
  await app.call('PATCH', '/tasks/t1', wb('mgA', { status: 'todo' }));                            // seq3: update changes []
  await app.call('PATCH', '/tasks/t3', wb('mgA', { title: 'z' }));                                // 403 không ghi
  await app.call('PATCH', '/tasks/nope', wb('adm', { title: 'z' }));                              // 404 không ghi
  await app.call('DELETE', '/tasks/t2', as('m1'));                                                // 403 không ghi
  await app.call('DELETE', '/tasks/t2', as('adm'));                                               // seq4 delete
  const r = await app.call('GET', '/audit', as('adm'));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.taskId, e.userId, e.changes]), [
    [4, 'delete', 't2', 'adm', []],
    [3, 'update', 't1', 'mgA', []],
    [2, 'update', 't1', 'mgA', ['assignee', 'title']],
    [1, 'create', 't11', 'adm', ['priority', 'team', 'title']],
  ]);
  for (const e of r.json.items) assert.equal(e.at, NOW);
  assert.deepEqual(Object.keys(r.json.items[0]).sort(), ['action', 'at', 'changes', 'seq', 'taskId', 'userId']);
  assert.deepEqual((await app.call('GET', '/audit?taskId=t1', as('adm'))).json.items.map((e) => e.seq), [3, 2]);
  assert.deepEqual((await app.call('GET', '/audit?taskId=zzz', as('adm'))).json, { items: [] });
}));

test('audit: at theo đồng hồ createServer, quyền và query', () => {
  let n = 0;
  return withApp(async (app) => {
    await app.call('POST', '/tasks', wb('adm', { title: 'a', team: 'A' }));
    await app.call('POST', '/tasks', wb('adm', { title: 'b', team: 'A' }));
    const it = (await app.call('GET', '/audit', as('adm'))).json.items;
    assert.equal(new Date(it[0].at) > new Date(it[1].at), true);
    for (const u of ['mgA', 'm1', 'mb']) {
      const r = await app.call('GET', '/audit', as(u));
      assert.equal(r.status, 403, u); assert.equal(r.json.error.code, 'FORBIDDEN');
    }
    assert.equal(await badQ(app, '/audit?x=1'), 'x');
    assert.equal(await badQ(app, '/audit?taskId=a&taskId=b'), 'taskId');
  }, { now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, n++)) });
});
