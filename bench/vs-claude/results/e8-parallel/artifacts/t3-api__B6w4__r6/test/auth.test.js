'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ 'x-user': id });
const ADMIN = as('u1');
const MGR_A = as('u2');
const MEM_A = as('u3');
const MEM_B = as('u4');
const NOW = () => new Date('2026-11-01T00:00:00Z');
const HEADER = 'id,title,status,priority,assignee,team,dueDate,createdAt\r\n';

async function withApp(fn) {
  const app = await start({ now: NOW });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const code = (r) => r.json && r.json.error && r.json.error.code;

test('401 khi thiếu hoặc sai X-User (mọi route)', () =>
  withApp(async (app) => {
    const routes = [['GET', '/tasks'], ['GET', '/tasks/export.csv'], ['GET', '/tasks/t1'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit']];
    for (const [m, p] of routes) {
      for (const headers of [{}, as('nope')]) {
        const r = await app.call(m, p, { headers });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(code(r), 'UNAUTHENTICATED');
      }
    }
    assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401); // 401 trước query 400
  }));

test('thứ tự: query 400 đứng trước phần còn lại', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks?status=zzz', { headers: MEM_A });
    assert.equal(r.status, 400);
    assert.equal(code(r), 'INVALID_QUERY');
    assert.equal(r.json.error.field, 'status');
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', { headers: MEM_A })).status, 400);
  }));

test('member: chỉ thấy nhóm mình, nhóm khác → 404', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', { headers: MEM_A });
    assert.equal(list.json.total, 7);
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    const other = await app.call('GET', '/tasks?team=B', { headers: MEM_A });
    assert.equal(other.status, 200);
    assert.deepEqual(other.json.items, []);
    assert.equal(other.json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', { headers: MEM_A })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', { headers: MEM_A, body: { status: 'done' } })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', { headers: MEM_A })).status, 404);
    assert.equal((await app.call('GET', '/tasks/t1', { headers: MEM_A })).status, 200);
  }));

test('member: tạo/xóa → 403; chỉ sửa status của task giao cho mình', () =>
  withApp(async (app) => {
    const post = await app.call('POST', '/tasks', { headers: MEM_A, body: {} });
    assert.equal(post.status, 403);
    assert.equal(code(post), 'FORBIDDEN');
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: MEM_A })).status, 403);
    // không giao cho mình → 403, kể cả body sai
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: MEM_A, body: { status: 'nope' } })).status, 403);
    // khóa khác status (kể cả trùng giá trị cũ) → 403 trước validate
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MEM_A, body: { status: 'done', title: '' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MEM_A, body: { status: 'done', priority: 2 } })).status, 403);
    const ok = await app.call('PATCH', '/tasks/t1', { headers: MEM_A, body: { status: 'todo' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'todo');
    const bad = await app.call('PATCH', '/tasks/t1', { headers: MEM_A, body: { status: 'nope' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.field, 'status');
  }));

test('manager: quyền theo nhóm', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks/t4', { headers: MGR_A })).status, 200);
    assert.equal((await app.call('GET', '/tasks', { headers: MGR_A })).json.total, 12);
    assert.equal((await app.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: MGR_A, body: { title: '', team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await app.call('POST', '/tasks', { headers: MGR_A, body: { title: '', team: 'A' } })).status, 400);
    assert.equal((await app.call('PATCH', '/tasks/t4', { headers: MGR_A, body: { title: 'y' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MGR_A, body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MGR_A, body: { team: 'B', title: '' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MGR_A, body: { title: 'y', priority: 3 } })).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MGR_A, body: { title: '' } })).status, 400);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: MGR_A })).status, 403);
    assert.equal((await app.call('GET', '/tasks/t99', { headers: MGR_A })).status, 404);
  }));

test('export.csv: header HTTP, nội dung, quyền member, không phân trang', () =>
  withApp(async (app) => {
    const ok = await app.call('GET', '/tasks/export.csv?status=done', { headers: ADMIN });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(ok.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    // res.text() của fetch tự bỏ BOM nên đọc byte thô để kiểm tra BOM
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv?status=done', { headers: ADMIN })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(ok.text.startsWith(HEADER));
    assert.equal(ok.text.split('\r\n').length, 1 + 3 + 1); // header + t1,t8,t12 + phần rỗng sau \r\n cuối
    const mem = await app.call('GET', '/tasks/export.csv?status=done', { headers: MEM_B });
    assert.equal(mem.text.split('\r\n').length, 1 + 1 + 1); // chỉ t12
    const none = await app.call('GET', '/tasks/export.csv?team=A', { headers: MEM_B });
    assert.equal(none.text, HEADER);
    assert.equal((await app.call('GET', '/tasks/export.csv?pageSize=5', { headers: ADMIN })).status, 400);
  }));

test('audit: ghi khi thành công, không ghi khi lỗi; chỉ admin đọc', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'A', priority: 3 } }); // t13
    await app.call('POST', '/tasks', { headers: MGR_A, body: { title: '', team: 'A' } }); // lỗi
    await app.call('PATCH', '/tasks/t13', { headers: MGR_A, body: { title: 'x', priority: 1, status: 'doing' } });
    await app.call('PATCH', '/tasks/t4', { headers: MGR_A, body: { title: 'z' } }); // 403
    await app.call('DELETE', '/tasks/t13', { headers: ADMIN });
    const r = await app.call('GET', '/audit', { headers: ADMIN });
    assert.equal(r.status, 200);
    const items = r.json.items;
    assert.equal(items.length, 3);
    assert.deepEqual(items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(items.map((e) => e.action), ['delete', 'update', 'create']);
    assert.deepEqual(items[0].changes, []);
    assert.deepEqual(items[1].changes, ['priority', 'status']);
    assert.deepEqual(items[2].changes, ['priority', 'team', 'title']);
    assert.equal(items[2].userId, 'u2');
    assert.equal(items[2].at, '2026-11-01T00:00:00.000Z');
    assert.equal(items[2].taskId, 't13');
    assert.deepEqual((await app.call('GET', '/audit?taskId=t99', { headers: ADMIN })).json.items, []);
    assert.equal((await app.call('GET', '/audit', { headers: MGR_A })).status, 403);
    assert.equal((await app.call('GET', '/audit', { headers: MEM_A })).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', { headers: ADMIN })).status, 400);
  }));
