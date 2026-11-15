'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const seed = {
  users: [
    { id: 'u1', name: 'A', role: 'admin', team: null },
    { id: 'u2', name: 'M', role: 'manager', team: 'A' },
    { id: 'u3', name: 'Mem', role: 'member', team: 'A' },
  ],
  tasks: [
    { id: 't1', title: 'a,b', status: 'todo', priority: 1, assignee: 'u3', team: 'A', dueDate: '2026-11-05', createdAt: '2026-10-01T00:00:00.000Z' },
    { id: 't2', title: 'say "hi"\nline', status: 'doing', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-10-02T00:00:00.000Z' },
    { id: 't3', title: '=SUM(A1)', status: 'done', priority: 3, assignee: 'u3', team: 'B', dueDate: null, createdAt: '2026-10-03T00:00:00.000Z' },
    { id: 't4', title: '+1', status: 'todo', priority: 3, assignee: null, team: 'A', dueDate: null, createdAt: '2026-10-04T00:00:00.000Z' },
    { id: 't5', title: '-x', status: 'todo', priority: 3, assignee: null, team: 'A', dueDate: null, createdAt: '2026-10-05T00:00:00.000Z' },
    { id: 't6', title: '@u', status: 'todo', priority: 3, assignee: null, team: 'A', dueDate: null, createdAt: '2026-10-06T00:00:00.000Z' },
    { id: 't7', title: '\tTab', status: 'todo', priority: 3, assignee: null, team: 'A', dueDate: null, createdAt: '2026-10-07T00:00:00.000Z' },
    { id: 't8', title: '\rCR', status: 'todo', priority: 3, assignee: null, team: 'A', dueDate: null, createdAt: '2026-10-08T00:00:00.000Z' },
  ],
};

async function withApp(fn) {
  const app = await start({ seed, now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

const raw = async (app, path, user) => {
  const res = await fetch(app.base + path, { headers: user ? { 'x-user': user } : {} });
  return { res, buf: Buffer.from(await res.arrayBuffer()) };
};

test('CSV: header HTTP, BOM thô, CRLF, tiêu đề cột', () =>
  withApp(async (app) => {
    const { res, buf } = await raw(app, '/tasks/export.csv', 'u1');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const text = buf.toString('utf8').slice(1);
    assert.ok(text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(text.endsWith('\r\n'));
    assert.ok(!/(^|[^\r])\n/.test(text.replace(/"[^"]*"/g, '""')), 'chỉ dùng \\r\\n ngoài ô trích');
  }));

test('CSV: RFC 4180, null thành ô trống, chống chèn công thức', () =>
  withApp(async (app) => {
    const { buf } = await raw(app, '/tasks/export.csv', 'u1');
    const text = buf.toString('utf8');
    assert.ok(text.includes('t1,"a,b",todo,1,u3,A,2026-11-05,2026-10-01T00:00:00.000Z\r\n'));
    assert.ok(text.includes('t2,"say ""hi""\nline",doing,2,,A,,2026-10-02T00:00:00.000Z\r\n'));
    assert.ok(text.includes("t3,'=SUM(A1),done,3,u3,B,,"));
    assert.ok(text.includes("t4,'+1,"));
    assert.ok(text.includes("t5,'-x,"));
    assert.ok(text.includes("t6,'@u,"));
    assert.ok(text.includes("t7,'\tTab,"));
    assert.ok(text.includes('t8,"\'\rCR",'));
  }));

test('CSV: áp bộ lọc/sắp xếp, không phân trang, quyền member, 400 với page', () =>
  withApp(async (app) => {
    const a = (await raw(app, '/tasks/export.csv?status=todo&sort=-createdAt', 'u1')).buf.toString('utf8');
    const rows = a.slice(1).split('\r\n').filter(Boolean);
    assert.ok(rows[1].startsWith('t8,'));
    assert.ok(!a.includes('t2,'));
    const m = (await raw(app, '/tasks/export.csv', 'u3')).buf.toString('utf8');
    assert.ok(!m.includes('t3,'), 'member không thấy nhóm B');
    for (const p of ['page=1', 'pageSize=5']) {
      const r = await app.call('GET', `/tasks/export.csv?${p}`, { headers: { 'x-user': 'u1' } });
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
    }
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
  }));

test('Audit: ghi create/update/delete đúng định dạng, lỗi không ghi', () =>
  withApp(async (app) => {
    const h = { 'x-user': 'u1' };
    await app.call('POST', '/tasks', { headers: h, body: { title: 'X', team: 'A', priority: 1 } });
    await app.call('POST', '/tasks', { headers: h, body: { title: '', team: 'A' } }); // lỗi, không ghi
    await app.call('PATCH', '/tasks/t1', { headers: h, body: { title: 'a,b', status: 'done' } }); // title không đổi
    await app.call('PATCH', '/tasks/t1', { headers: h, body: { status: 'done' } }); // không đổi gì
    await app.call('PATCH', '/tasks/nope', { headers: h, body: { status: 'done' } }); // 404, không ghi
    await app.call('DELETE', '/tasks/t9', { headers: h });
    const r = await app.call('GET', '/audit', { headers: h });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [4, 3, 2, 1]);
    assert.deepEqual(r.json.items[3], { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'create', taskId: 't9', changes: ['priority', 'team', 'title'] });
    assert.deepEqual(r.json.items[2], { seq: 2, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'update', taskId: 't1', changes: ['status'] });
    assert.deepEqual(r.json.items[1].changes, []);
    assert.deepEqual(r.json.items[0], { seq: 4, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'delete', taskId: 't9', changes: [] });
    const f = await app.call('GET', '/audit?taskId=t9', { headers: h });
    assert.deepEqual(f.json.items.map((e) => e.seq), [4, 1]);
  }));

test('Audit: quyền và tham số', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/audit')).status, 401);
    assert.equal((await app.call('GET', '/audit', { headers: { 'x-user': 'u2' } })).status, 403);
    assert.equal((await app.call('GET', '/audit', { headers: { 'x-user': 'u3' } })).status, 403);
    // 400 đứng trước 403
    const bad = await app.call('GET', '/audit?foo=1', { headers: { 'x-user': 'u3' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit?taskId=a&taskId=b', { headers: { 'x-user': 'u1' } })).status, 400);
    // thao tác bị 403 không ghi
    await app.call('PATCH', '/tasks/t1', { headers: { 'x-user': 'u3' }, body: { title: 'z' } });
    assert.deepEqual((await app.call('GET', '/audit', { headers: { 'x-user': 'u1' } })).json.items, []);
  }));
