'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const NOW = () => new Date('2026-11-01T00:00:00Z');
async function withApp(fn) {
  const app = await start({ now: NOW });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);

test('xác thực: 401 khi thiếu hoặc sai X-User', async () => {
  await withApp(async (a) => {
    for (const path of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
      assert.equal((await a.call('GET', path, { as: null })).status, 401);
      const r = await a.call('GET', path, { as: 'nope' });
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    // 401 đi trước 400
    assert.equal((await a.call('GET', '/tasks?bad=1', { as: null })).status, 401);
  });
});

test('phân quyền: manager', async () => {
  await withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks/t4', { as: 'u2' })).status, 200);
    assert.equal((await a.call('POST', '/tasks', { as: 'u2', body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { as: 'u2', body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await a.call('PATCH', '/tasks/t4', { as: 'u2', body: { title: 'y' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { as: 'u2', body: { team: 'B' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { as: 'u2', body: { priority: 3 } })).status, 200);
    assert.equal((await a.call('DELETE', '/tasks/t1', { as: 'u2' })).status, 403);
    // 403 đi trước validate body
    assert.equal((await a.call('PATCH', '/tasks/t4', { as: 'u2', body: { title: '' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { as: 'u2', body: { title: '' } })).status, 400);
  });
});

test('phân quyền: member', async () => {
  await withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks/t4', { as: 'u3' })).status, 404);
    assert.equal((await a.call('PATCH', '/tasks/t4', { as: 'u3', body: { status: 'done' } })).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t4', { as: 'u3' })).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t1', { as: 'u3' })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { as: 'u3', body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t3', { as: 'u3', body: { status: 'done' } })).status, 403); // giao u6
    assert.equal((await a.call('PATCH', '/tasks/t2', { as: 'u3', body: { status: 'doing', title: 'q' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t2', { as: 'u3', body: { priority: 1 } })).status, 403);
    const ok = await a.call('PATCH', '/tasks/t2', { as: 'u3', body: { status: 'done' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
    const list = await a.call('GET', '/tasks?team=B', { as: 'u3' });
    assert.equal(list.json.total, 0);
    assert.equal((await a.call('GET', '/tasks', { as: 'u3' })).json.total, 7);
  });
});

test('danh sách: lọc, tìm, sắp xếp, phân trang', async () => {
  await withApp(async (a) => {
    assert.deepEqual(ids(await a.call('GET', '/tasks?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?q=dac+ta')), ['t4', 't12']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?q=' + encodeURIComponent('ĐÀO TẠO'))), ['t10']);
    assert.equal((await a.call('GET', '/tasks?q=')).json.total, 12);
    assert.deepEqual(ids(await a.call('GET', '/tasks?dueBefore=2026-11-05&sort=dueDate')), ['t8', 't12', 't1', 't9']);
    // dueDate giảm dần: null luôn cuối, hòa theo id số tăng
    const d = ids(await a.call('GET', '/tasks?sort=-dueDate'));
    assert.deepEqual(d.slice(-2), ['t3', 't10']);
    assert.deepEqual(d.slice(0, 3), ['t7', 't4', 't11']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?sort=priority&pageSize=4')), ['t1', 't2', 't6', 't9']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?sort=-priority&pageSize=3')), ['t4', 't7', 't11']);
    const p = await a.call('GET', '/tasks?page=2&pageSize=5');
    assert.deepEqual(ids(p), ['t6', 't7', 't8', 't9', 't10']);
    assert.equal(p.json.total, 12);
    const far = await a.call('GET', '/tasks?page=9');
    assert.equal(far.status, 200);
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
  });
});

test('danh sách: INVALID_QUERY', async () => {
  await withApp(async (a) => {
    const cases = [
      ['status=x', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2026-1-1', 'dueBefore'],
      ['sort=foo', 'sort'], ['page=1.5', 'page'], ['page=0', 'page'], ['page=abc', 'page'], ['pageSize=101', 'pageSize'],
      ['pageSize=0', 'pageSize'], ['foo=1', 'foo'], ['page=1&page=2', 'page'], ['sort=foo&page=0', 'sort'], ['page=0&sort=foo', 'page'],
    ];
    for (const [qs, field] of cases) {
      const r = await a.call('GET', '/tasks?' + qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  });
});

test('xuất CSV', async () => {
  await withApp(async (a) => {
    const r = await a.call('GET', '/tasks/export.csv?sort=-createdAt');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(r.text.startsWith('\uFEFFid,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('\r\nt7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,2026-10-07T08:00:00.000Z\r\n'));
    assert.ok(r.text.includes('\r\nt8,"Hướng dẫn sử dụng\nphiên bản 2",done,2,u3,A,2026-10-30,'));
    assert.ok(r.text.includes('\r\nt11,\'-Ghi chú nội bộ,todo,3,,A,2026-11-15,'));
    assert.ok(r.text.includes(',2026-10-01T08:00:00.000Z\r\n'));
    assert.equal(r.text.split('\r\n').length, 14);
    for (const qs of ['page=1', 'pageSize=5']) assert.equal((await a.call('GET', '/tasks/export.csv?' + qs)).status, 400);
    const m = await a.call('GET', '/tasks/export.csv?status=done', { as: 'u4' });
    assert.equal(m.text.split('\r\n').length, 3); // header + t12 + rỗng
  });
});

test('nhật ký thao tác', async () => {
  await withApp(async (a) => {
    await a.call('POST', '/tasks', { as: 'u2', body: { title: 'N', team: 'A', priority: 1 } });
    await a.call('PATCH', '/tasks/t13', { as: 'u2', body: { title: 'N', status: 'doing', priority: 1 } });
    await a.call('PATCH', '/tasks/t99', { body: { status: 'doing' } }); // lỗi → không ghi
    await a.call('POST', '/tasks', { body: { title: '', team: 'A' } }); // lỗi → không ghi
    await a.call('DELETE', '/tasks/t13');
    const r = await a.call('GET', '/audit');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]), [
      [3, 'u1', 'delete', 't13', []],
      [2, 'u2', 'update', 't13', ['status']],
      [1, 'u2', 'create', 't13', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal((await a.call('GET', '/audit?taskId=t1')).json.items.length, 0);
    assert.equal((await a.call('GET', '/audit?taskId=t13')).json.items.length, 3);
    assert.equal((await a.call('GET', '/audit?x=1')).status, 400);
    assert.equal((await a.call('GET', '/audit', { as: 'u2' })).status, 403);
    assert.equal((await a.call('GET', '/audit?x=1', { as: 'u2' })).status, 400);
  });
});
