'use strict';
// Test biên cho 4 tính năng (xác thực/phân quyền, truy vấn, CSV, nhật ký). Mỗi test tự dựng server riêng
// với seed nhỏ nên độc lập thứ tự chạy.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });
const CA = '2026-01-01T00:00:00.000Z';

const USERS = [
  { id: 'ad', name: 'Admin', role: 'admin', team: null },
  { id: 'ma', name: 'Manager A', role: 'manager', team: 'A' },
  { id: 'mb', name: 'Manager B', role: 'manager', team: 'B' },
  { id: 'sa', name: 'Member A', role: 'member', team: 'A' },
  { id: 'sb', name: 'Member B', role: 'member', team: 'B' },
];
const T = (id, o) => ({ title: id, status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: CA, ...o, id });

const SORT_SEED = {
  users: USERS,
  tasks: [
    T('t10', { title: 'c', dueDate: '2026-05-01', team: 'B' }),
    T('t2', { title: 'a', dueDate: null }),
    T('t1', { title: 'b', dueDate: '2026-05-02', assignee: 'sa' }),
    T('t9', { title: 'Đường đi', priority: 2, team: 'B', assignee: 'sb', status: 'doing' }),
  ],
};

const CSV_SEED = {
  users: USERS,
  tasks: [
    T('t1', { title: '@cmd' }),
    T('t2', { title: '+1' }),
    T('t3', { title: '\tTab' }),
    T('t4', { title: '\rCR' }),
    T('t5', { title: 'a,b "q"', assignee: 'sa', dueDate: '2026-03-04', priority: 0 }),
    T('t6', { title: 'xuống\ndòng', team: 'B' }),
    T('t7', { title: '=1+1', team: 'B' }),
  ],
};

async function run(fn, opts) {
  const app = await start(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);

test('401: thiếu/sai X-User, mọi route, và đi trước 400 query', () =>
  run(async (app) => {
    const routes = [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'],
      ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1']];
    for (const [m, p] of routes) {
      for (const headers of [{}, { 'x-user': 'nobody' }, { 'x-user': '' }]) {
        const r = await app.call(m, p, { headers });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
    for (const p of ['/tasks?bogus=1', '/tasks?page=0', '/tasks/export.csv?page=1', '/audit?x=1']) {
      assert.equal((await app.call('GET', p)).status, 401, p);
    }
    assert.equal((await app.call('GET', '/tasks/t404')).status, 401); // 401 trước 404
  }, { seed: SORT_SEED }));

test('phân quyền: 404/403 theo vai trò và thứ tự kiểm tra', () =>
  run(async (app) => {
    const code = async (m, p, u, body) => {
      const r = await app.call(m, p, body === undefined ? as(u) : withBody(u, body));
      return [r.status, r.json && r.json.error && r.json.error.code];
    };
    // member nhóm A không thấy nhiệm vụ nhóm B
    assert.deepEqual(await code('GET', '/tasks/t9', 'sa'), [404, 'NOT_FOUND']);
    assert.equal((await code('PATCH', '/tasks/t9', 'sa', { status: 'done' }))[0], 404);
    assert.equal((await code('DELETE', '/tasks/t9', 'sa'))[0], 404);
    // 404 trước body lỗi
    assert.equal((await code('PATCH', '/tasks/t9', 'sa', { status: 'bad' }))[0], 404);
    // member DELETE nhiệm vụ cùng nhóm → 403
    assert.deepEqual(await code('DELETE', '/tasks/t1', 'sa'), [403, 'FORBIDDEN']);
    // member POST → 403 (trước validate)
    assert.deepEqual(await code('POST', '/tasks', 'sa', { title: '', team: 'A' }), [403, 'FORBIDDEN']);
    // member PATCH: chỉ status & được giao cho mình
    assert.equal((await code('PATCH', '/tasks/t1', 'sa', { status: 'done' }))[0], 200);
    assert.equal((await code('PATCH', '/tasks/t1', 'sa', { status: 'done', priority: 1 }))[0], 403);
    assert.equal((await code('PATCH', '/tasks/t2', 'sa', { status: 'done' }))[0], 403); // không giao cho mình
    assert.equal((await code('PATCH', '/tasks/t2', 'sa', { status: 'bad' }))[0], 403); // 403 trước validate
    // manager
    assert.deepEqual(await code('POST', '/tasks', 'ma', { title: 'x', team: 'B' }), [403, 'FORBIDDEN']);
    assert.deepEqual(await code('POST', '/tasks', 'ma', { title: 'x', team: 'C' }), [403, 'FORBIDDEN']);
    assert.equal((await code('POST', '/tasks', 'ma', { title: 'x', team: 'A' }))[0], 201);
    assert.equal((await code('GET', '/tasks/t9', 'ma'))[0], 200);
    assert.equal((await code('PATCH', '/tasks/t9', 'ma', { title: 'x' }))[0], 403);
    assert.equal((await code('PATCH', '/tasks/t1', 'ma', { team: 'B' }))[0], 403);
    assert.equal((await code('DELETE', '/tasks/t1', 'ma'))[0], 403);
    assert.equal((await code('DELETE', '/tasks/t404', 'ma'))[0], 404);
    // 403 trước 400 body (cả JSON hỏng)
    assert.equal((await code('PATCH', '/tasks/t9', 'ma', { status: 'bad' }))[0], 403);
    const broken = await fetch(app.base + '/tasks/t9', { method: 'PATCH', headers: { 'x-user': 'ma', 'content-type': 'application/json' }, body: '{oops' });
    assert.equal(broken.status, 403);
    // admin làm được mọi việc; body lỗi → 400
    assert.equal((await code('PATCH', '/tasks/t9', 'ad', { status: 'bad' }))[0], 400);
    assert.equal((await code('PATCH', '/tasks/t9', 'ad', { team: 'A' }))[0], 200);
    assert.equal((await code('DELETE', '/tasks/t9', 'ad'))[0], 204);
  }, { seed: SORT_SEED }));

test('query lỗi: tham số lạ/lặp/miền giá trị và tham số đầu tiên được báo', () =>
  run(async (app) => {
    const cases = [
      ['foo=1', 'foo'], ['status=todo&status=done', 'status'], ['page=1&page=2', 'page'],
      ['page=0', 'page'], ['page=-1', 'page'], ['page=1.5', 'page'], ['page=abc', 'page'],
      ['pageSize=0', 'pageSize'], ['pageSize=101', 'pageSize'], ['pageSize=1000', 'pageSize'],
      ['sort=foo', 'sort'], ['sort=--title', 'sort'], ['sort=id', 'sort'],
      ['status=todo,x', 'status'], ['status=', 'status'], ['team=a', 'team'], ['team=C', 'team'],
      ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2026-2-3', 'dueBefore'], ['dueBefore=abc', 'dueBefore'],
      ['sort=zzz&page=0&foo=1', 'sort'], ['foo=1&page=0&sort=zzz', 'foo'], ['page=0&foo=1', 'page'],
      ['team=A&team=B&sort=bad', 'team'], ['pageSize=500&status=x', 'pageSize'], ['status=x&pageSize=500', 'status'],
    ];
    for (const [qs, field] of cases) {
      for (const u of ['ad', 'sa']) {
        const r = await app.call('GET', '/tasks?' + qs, as(u));
        assert.equal(r.status, 400, qs);
        assert.equal(r.json.error.code, 'INVALID_QUERY', qs);
        assert.equal(r.json.error.field, field, qs);
      }
    }
  }, { seed: SORT_SEED }));

test('lọc, tìm q (không dấu, đ, hoa/thường), kết hợp bộ lọc', () =>
  run(async (app) => {
    const get = (qs, u = 'ad') => app.call('GET', '/tasks' + qs, as(u));
    for (const q of ['duong', 'DUONG', 'đường', 'ĐƯỜNG', 'dUờNg đi', 'd', 'uong']) {
      assert.deepEqual(ids(await get('?q=' + encodeURIComponent(q))), ['t9'], q);
    }
    assert.equal((await get('?q=')).json.total, 4);
    assert.equal((await get('?q=zzz')).json.total, 0);
    assert.deepEqual(ids(await get('?status=doing')), ['t9']);
    assert.deepEqual(ids(await get('?status=doing,todo&team=B')), ['t9', 't10']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t2', 't10']);
    assert.deepEqual(ids(await get('?assignee=sa')), ['t1']);
    assert.deepEqual(ids(await get('?dueBefore=2026-05-01')), ['t10']); // ≤, loại null
    assert.deepEqual(ids(await get('?dueBefore=2026-05-02')), ['t1', 't10']);
    // member: nhóm mình luôn được áp
    assert.deepEqual(ids(await get('', 'sb')), ['t9', 't10']);
    const other = await get('?team=A', 'sb');
    assert.equal(other.status, 200);
    assert.equal(other.json.total, 0);
    assert.deepEqual(ids(await get('?assignee=none', 'sa')), ['t2']);
  }, { seed: SORT_SEED }));

test('sắp xếp: hòa theo id số, dueDate null ở cuối, phân trang', () =>
  run(async (app) => {
    const get = (qs) => app.call('GET', '/tasks' + qs, as('ad'));
    // mặc định createdAt tăng, hòa → id số tăng (t2 < t9 < t10)
    assert.deepEqual(ids(await get('')), ['t1', 't2', 't9', 't10']);
    assert.deepEqual(ids(await get('?sort=createdAt')), ['t1', 't2', 't9', 't10']);
    assert.deepEqual(ids(await get('?sort=-createdAt')), ['t1', 't2', 't9', 't10']); // hòa vẫn tăng
    assert.deepEqual(ids(await get('?sort=priority')), ['t1', 't2', 't10', 't9']);
    assert.deepEqual(ids(await get('?sort=-priority')), ['t9', 't1', 't2', 't10']);
    assert.deepEqual(ids(await get('?sort=dueDate')), ['t10', 't1', 't2', 't9']);
    assert.deepEqual(ids(await get('?sort=-dueDate')), ['t1', 't10', 't2', 't9']); // null vẫn cuối
    assert.deepEqual(ids(await get('?sort=title')), ['t2', 't1', 't10', 't9']);
    assert.deepEqual(ids(await get('?sort=-title')), ['t9', 't10', 't1', 't2']);
    // phân trang
    const p1 = await get('?pageSize=3');
    assert.deepEqual([p1.json.page, p1.json.pageSize, p1.json.total, ids(p1)], [1, 3, 4, ['t1', 't2', 't9']]);
    const p2 = await get('?pageSize=3&page=2');
    assert.deepEqual([p2.json.page, ids(p2)], [2, ['t10']]);
    const p3 = await get('?pageSize=3&page=3');
    assert.equal(p3.status, 200);
    assert.deepEqual([p3.json.items, p3.json.total, p3.json.page], [[], 4, 3]);
    assert.equal((await get('?pageSize=100')).json.pageSize, 100);
    assert.equal((await get('?page=99999')).json.total, 4);
  }, { seed: SORT_SEED }));

test('CSV: byte thô, header, escape, chống công thức', () =>
  run(async (app) => {
    const res = await fetch(app.base + '/tasks/export.csv', as('ad'));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(raw.subarray(3, 5).toString(), 'id');
    assert.equal(raw.subarray(0, 6).includes(Buffer.from([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf])), false); // BOM không lặp
    const text = raw.subarray(3).toString('utf8');
    assert.ok(text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(text.endsWith('\r\n'));
    assert.equal(text.endsWith('\r\n\r\n'), false);
    const expected = [
      `t1,'@cmd,todo,1,,A,,${CA}`,
      `t2,'+1,todo,1,,A,,${CA}`,
      `t3,'\tTab,todo,1,,A,,${CA}`, // tab không phải ký tự buộc bọc ngoặc kép
      `t4,"'\rCR",todo,1,,A,,${CA}`,
      `t5,"a,b ""q""",todo,0,sa,A,2026-03-04,${CA}`,
      `t6,"xuống\ndòng",todo,1,,B,,${CA}`,
      `t7,'=1+1,todo,1,,B,,${CA}`,
    ];
    assert.equal(text, 'id,title,status,priority,assignee,team,dueDate,createdAt\r\n' + expected.join('\r\n') + '\r\n');
    // '-' đầu chuỗi và số âm
    const dash = await app.call('POST', '/tasks', withBody('ad', { title: '-x', team: 'A' }));
    assert.equal(dash.status, 201);
    const again = await app.call('GET', '/tasks/export.csv?q=-x', as('ad'));
    assert.ok(again.text.includes("t8,'-x,"));
  }, { seed: CSV_SEED }));

test('CSV: quyền, bộ lọc, sắp xếp, số dòng và lỗi query', () =>
  run(async (app) => {
    const rows = async (qs, u) => {
      const r = await app.call('GET', '/tasks/export.csv' + qs, as(u));
      assert.equal(r.status, 200, qs);
      return r.text.split('\r\n').length - 2; // trừ header và phần tử rỗng cuối
    };
    assert.equal(await rows('', 'ad'), 7);
    assert.equal(await rows('', 'ma'), 7); // manager đọc mọi nhóm
    assert.equal(await rows('', 'sa'), 5);
    assert.equal(await rows('', 'sb'), 2);
    assert.equal(await rows('?team=A', 'sb'), 0);
    assert.equal(await rows('?team=B', 'ad'), 2);
    assert.equal(await rows('?q=khong%20co', 'ad'), 0);
    const empty = await app.call('GET', '/tasks/export.csv?q=khong%20co', as('ad'));
    assert.equal(empty.text, 'id,title,status,priority,assignee,team,dueDate,createdAt\r\n');
    const sorted = await app.call('GET', '/tasks/export.csv?sort=-dueDate&assignee=sa', as('ad'));
    assert.ok(sorted.text.split('\r\n')[1].startsWith('t5,'));
    // không phân trang / lỗi query
    for (const [qs, field] of [['?page=1', 'page'], ['?pageSize=5', 'pageSize'], ['?foo=1', 'foo'], ['?sort=x&page=1', 'sort'], ['?page=1&sort=x', 'page'], ['?team=A&team=B', 'team']]) {
      const r = await app.call('GET', '/tasks/export.csv' + qs, as('ad'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
    // /tasks/export.csv không bị coi là id
    assert.equal((await app.call('GET', '/tasks/export.csv', as('sb'))).headers.get('content-type'), 'text/csv; charset=utf-8');
  }, { seed: CSV_SEED }));

test('audit: create/update/delete, changes, now, lọc, quyền, thao tác lỗi không ghi', () =>
  run(async (app) => {
    const audit = (qs = '', u = 'ad') => app.call('GET', '/audit' + qs, as(u));
    for (const u of ['ma', 'sa']) {
      const r = await audit('', u);
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, 'FORBIDDEN');
    }
    assert.equal((await audit('?x=1', 'ma')).status, 400); // 400 query trước 403
    const bad = await audit('?x=1&taskId=t1');
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.field, 'x');
    assert.equal((await audit('?taskId=a&taskId=b')).status, 400);
    assert.deepEqual((await audit()).json, { items: [] });

    const created = await app.call('POST', '/tasks', withBody('ad', { title: 'N', team: 'A', priority: 2 }));
    assert.equal(created.status, 201);
    const id = created.json.id;
    // lỗi: không ghi
    await app.call('POST', '/tasks', withBody('ad', { title: '', team: 'A' }));
    await app.call('POST', '/tasks', withBody('sa', { title: 'x', team: 'A' }));
    await app.call('PATCH', '/tasks/' + id, withBody('ad', { status: 'bad' }));
    await app.call('PATCH', '/tasks/' + id, withBody('mb', { title: 'z' }));
    await app.call('DELETE', '/tasks/t404', as('ad'));
    await app.call('DELETE', '/tasks/' + id, as('ma'));
    // update: chỉ trường đổi giá trị
    const upd = await app.call('PATCH', '/tasks/' + id, withBody('ma', { title: 'N', status: 'doing', priority: 3, team: 'A' }));
    assert.equal(upd.status, 200);
    await app.call('PATCH', '/tasks/t1', withBody('sa', { status: 'done' }));
    assert.equal((await app.call('DELETE', '/tasks/' + id, as('ad'))).status, 204);

    const all = await audit();
    assert.equal(all.status, 200);
    assert.deepEqual(all.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]), [
      [4, 'ad', 'delete', id, []],
      [3, 'sa', 'update', 't1', ['status']],
      [2, 'ma', 'update', id, ['priority', 'status']],
      [1, 'ad', 'create', id, ['priority', 'team', 'title']],
    ]);
    for (const e of all.json.items) assert.equal(e.at, '2026-06-07T08:09:10.000Z');
    assert.deepEqual(Object.keys(all.json.items[0]).sort(), ['action', 'at', 'changes', 'seq', 'taskId', 'userId']);
    assert.deepEqual((await audit('?taskId=' + id)).json.items.map((e) => e.seq), [4, 2, 1]);
    assert.deepEqual((await audit('?taskId=t1')).json.items.map((e) => e.seq), [3]);
    assert.deepEqual((await audit('?taskId=nope')).json.items, []);
  }, { seed: SORT_SEED, now: () => new Date('2026-06-07T08:09:10Z') }));
