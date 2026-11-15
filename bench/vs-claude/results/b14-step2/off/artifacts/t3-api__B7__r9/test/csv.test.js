'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const users = [
  { id: 'u1', name: 'Admin', role: 'admin', team: null },
  { id: 'u2', name: 'MgrA', role: 'manager', team: 'A' },
  { id: 'u3', name: 'MemA', role: 'member', team: 'A' },
  { id: 'u4', name: 'MemB', role: 'member', team: 'B' },
];
const T = (id, o) => ({ id, title: id, status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const tasks = [
  T('t1', { title: 'Đường đi', assignee: 'u3', dueDate: '2026-03-01', priority: 1, createdAt: '2026-01-03T00:00:00.000Z' }),
  T('t2', { title: 'Zebra', status: 'doing', assignee: 'u4', team: 'B', dueDate: '2026-02-01', priority: 3, createdAt: '2026-01-02T00:00:00.000Z' }),
  T('t3', { title: 'a,b', createdAt: '2026-01-04T00:00:00.000Z' }),
  T('t4', { title: 'say "hi"', createdAt: '2026-01-05T00:00:00.000Z' }),
  T('t5', { title: 'dòng1\ndòng2', createdAt: '2026-01-06T00:00:00.000Z' }),
  T('t6', { title: 'cr\rx', createdAt: '2026-01-07T00:00:00.000Z' }),
  T('t7', { title: '=1+1', createdAt: '2026-01-08T00:00:00.000Z' }),
  T('t8', { title: '+a', createdAt: '2026-01-09T00:00:00.000Z' }),
  T('t9', { title: '-b', createdAt: '2026-01-10T00:00:00.000Z' }),
  T('t10', { title: '@c', createdAt: '2026-01-11T00:00:00.000Z' }),
  T('t11', { title: '\ttab', createdAt: '2026-01-12T00:00:00.000Z' }),
  T('t12', { title: '\rlead', createdAt: '2026-01-13T00:00:00.000Z' }),
  T('t13', { title: '=SUM(A1,B1)', createdAt: '2026-01-14T00:00:00.000Z' }),
  T('t14', { title: '=a"b', createdAt: '2026-01-15T00:00:00.000Z' }),
  T('t15', { title: '  =x', createdAt: '2026-01-16T00:00:00.000Z' }),
];
const HEADER = 'id,title,status,priority,assignee,team,dueDate,createdAt';
const CRLF = '\r\n';

async function withApp(fn, seedTasks = tasks) {
  const app = await start({ seed: { users, tasks: seedTasks } });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

async function raw(app, qs = '', user = 'u1') {
  const headers = user ? { 'x-user': user } : {};
  const res = await fetch(app.base + '/tasks/export.csv' + qs, { headers });
  const bytes = Buffer.from(await res.arrayBuffer());
  return { res, status: res.status, bytes };
}
const body = (r) => {
  assert.deepEqual([...r.bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  return r.bytes.subarray(3).toString('utf8');
};
const firstIds = (s) => s.split(CRLF).slice(1, -1).map((l) => l.split(',')[0]);

test('header HTTP, BOM, tiêu đề, CRLF cuối', () =>
  withApp(async (app) => {
    const r = await raw(app);
    assert.equal(r.status, 200);
    assert.equal(r.res.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const s = body(r);
    assert.ok(s.startsWith(HEADER + CRLF));
    assert.ok(s.endsWith(CRLF));
    assert.ok(!s.endsWith(CRLF + CRLF));
  }));

test('không có nhiệm vụ → chỉ BOM + tiêu đề + CRLF', () =>
  withApp(async (app) => {
    const r = await raw(app, '?status=done');
    assert.equal(body(r), HEADER + CRLF);
  }));

test('dòng dữ liệu, null → ô trống, priority là số', () =>
  withApp(async (app) => {
    const r = await raw(app, '?q=zebra');
    assert.equal(body(r), `${HEADER}${CRLF}t2,Zebra,doing,3,u4,B,2026-02-01,2026-01-02T00:00:00.000Z${CRLF}`);
    const r2 = await raw(app, '?q=a,b');
    assert.equal(body(r2), `${HEADER}${CRLF}t3,"a,b",todo,2,,A,,2026-01-04T00:00:00.000Z${CRLF}`);
  }));

test('RFC 4180: bọc ngoặc kép và nhân đôi "', () =>
  withApp(async (app) => {
    const s = body(await raw(app));
    assert.ok(s.includes(`${CRLF}t3,"a,b",todo`));
    assert.ok(s.includes(`${CRLF}t4,"say ""hi""",todo`));
    assert.ok(s.includes(`${CRLF}t5,"dòng1\ndòng2",todo`));
    assert.ok(s.includes(`${CRLF}t6,"cr\rx",todo`));
    assert.ok(s.includes(`${CRLF}t1,Đường đi,todo,1,u3,A,2026-03-01,`));
  }));

test('chống chèn công thức', () =>
  withApp(async (app) => {
    const s = body(await raw(app));
    assert.ok(s.includes(`${CRLF}t7,'=1+1,todo`));
    assert.ok(s.includes(`${CRLF}t8,'+a,todo`));
    assert.ok(s.includes(`${CRLF}t9,'-b,todo`));
    assert.ok(s.includes(`${CRLF}t10,'@c,todo`));
    assert.ok(s.includes(`${CRLF}t11,'\ttab,todo`));
    // vừa thêm ' vừa bọc ngoặc
    assert.ok(s.includes(`${CRLF}t12,"'\rlead",todo`));
    assert.ok(s.includes(`${CRLF}t13,"'=SUM(A1,B1)",todo`));
    assert.ok(s.includes(`${CRLF}t14,"'=a""b",todo`));
    // bắt đầu bằng khoảng trắng: không thêm '
    assert.ok(s.includes(`${CRLF}t15,  =x,todo`));
    assert.ok(s.includes(',todo,1,u3,'));
  }));

test('priority số âm không bị thêm dấu nháy', () =>
  withApp(
    async (app) => {
      const s = body(await raw(app));
      assert.ok(s.includes(`${CRLF}t1,t1,todo,-1,`));
    },
    [T('t1', { priority: -1 })],
  ));

test('cùng bộ lọc, sắp xếp như danh sách', () =>
  withApp(async (app) => {
    const qs = '?status=todo&team=A&sort=-createdAt&dueBefore=2026-12-31';
    const csv = firstIds(body(await raw(app, qs)));
    const list = await (await fetch(app.base + '/tasks' + qs, { headers: { 'x-user': 'u1' } })).json();
    assert.deepEqual(csv, list.items.map((t) => t.id));
    assert.deepEqual(csv, ['t1']);
    const all = firstIds(body(await raw(app, '?sort=-createdAt')));
    assert.equal(all.length, 15);
    assert.equal(all[0], 't15');
    assert.equal(all[14], 't2');
  }));

test('xuất không phân trang: 130 nhiệm vụ đều có mặt', () =>
  withApp(
    async (app) => {
      assert.equal(firstIds(body(await raw(app))).length, 130);
    },
    Array.from({ length: 130 }, (_, i) => T('t' + (i + 1))),
  ));

test('quyền: member chỉ thấy nhóm mình', () =>
  withApp(async (app) => {
    assert.deepEqual(firstIds(body(await raw(app, '', 'u4'))), ['t2']);
    const a = body(await raw(app, '', 'u3'));
    assert.ok(!a.includes('Zebra'));
    assert.ok(a.includes('Đường đi'));
    assert.equal(body(await raw(app, '?team=B', 'u3')), HEADER + CRLF);
    assert.equal((await raw(app, '', 'u2')).status, 200);
  }));

test('page/pageSize và tham số lạ → 400 INVALID_QUERY', () =>
  withApp(async (app) => {
    for (const [qs, field] of [['?page=1', 'page'], ['?pageSize=10', 'pageSize'], ['?foo=1', 'foo'], ['?status=todo&page=1&foo=1', 'page'], ['?sort=bad&page=1', 'sort'], ['?q=a&q=b', 'q']]) {
      const r = await raw(app, qs);
      assert.equal(r.status, 400, qs);
      const j = JSON.parse(r.bytes.toString('utf8'));
      assert.equal(j.error.code, 'INVALID_QUERY');
      assert.equal(j.error.field, field);
    }
  }));

test('401 khi thiếu/sai X-User; không bị /tasks/:id bắt nhầm', () =>
  withApp(async (app) => {
    let r = await raw(app, '', null);
    assert.equal(r.status, 401);
    assert.equal(JSON.parse(r.bytes.toString()).error.code, 'UNAUTHENTICATED');
    r = await raw(app, '', 'nobody');
    assert.equal(r.status, 401);
    r = await raw(app);
    assert.equal(r.status, 200);
    assert.match(r.res.headers.get('content-type'), /^text\/csv/);
  }));
