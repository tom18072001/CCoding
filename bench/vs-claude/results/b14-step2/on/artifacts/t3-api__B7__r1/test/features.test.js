'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ 'x-user': id });
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

test('xác thực: thiếu/sai X-User → 401', () =>
  withApp(async (a) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['DELETE', '/tasks/t1']]) {
      const r = await a.call(m, p);
      assert.equal(r.status, 401, p);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await a.call('GET', '/tasks', { headers: as('zzz') })).status, 401);
    // 401 đứng trước 400
    assert.equal((await a.call('GET', '/tasks?bogus=1')).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (a) => {
    assert.deepEqual(new Set((await a.call('GET', '/tasks', { headers: as('u3') })).json.items.map((t) => t.team)), new Set(['A']));
    assert.equal((await a.call('GET', '/tasks/t4', { headers: as('u3') })).status, 404);
    assert.equal((await a.call('PATCH', '/tasks/t4', { headers: as('u3'), body: { status: 'done' } })).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t4', { headers: as('u3') })).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t1', { headers: as('u3') })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { headers: as('u3'), body: { title: 'x', team: 'A' } })).status, 403);
    // t3 giao cho u6, không phải u3
    assert.equal((await a.call('PATCH', '/tasks/t3', { headers: as('u3'), body: { status: 'doing' } })).status, 403);
    // trường khác status (kể cả trùng giá trị cũ)
    const same = await a.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'done', priority: 1 } });
    assert.equal(same.status, 403);
    assert.equal(same.json.error.code, 'FORBIDDEN');
    const ok = await a.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'todo' } });
    assert.equal(ok.status, 200);
    // team khác nhóm mình → rỗng
    assert.deepEqual((await a.call('GET', '/tasks?team=B', { headers: as('u3') })).json.items, []);
  }));

test('phân quyền manager', () =>
  withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks/t4', { headers: as('u2') })).status, 200);
    assert.equal((await a.call('GET', '/tasks', { headers: as('u2') })).json.total, 12);
    assert.equal((await a.call('POST', '/tasks', { headers: as('u2'), body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { headers: as('u2'), body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await a.call('PATCH', '/tasks/t4', { headers: as('u2'), body: { title: 'y' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { team: 'B' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { title: 'y', priority: 3 } })).status, 200);
    assert.equal((await a.call('DELETE', '/tasks/t1', { headers: as('u2') })).status, 403);
    // 403 đứng trước validate body
    assert.equal((await a.call('PATCH', '/tasks/t4', { headers: as('u2'), body: { title: '' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { title: '' } })).status, 400);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (a) => {
    const h = { headers: as('u1') };
    assert.deepEqual(ids(await a.call('GET', '/tasks?status=doing,done&team=A', h)), ['t1', 't2', 't8', 't9', 't11'].filter((i) => i !== 't11'));
    assert.deepEqual(ids(await a.call('GET', '/tasks?assignee=none', h)), ['t6', 't11']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?q=dac%20ta', h)), ['t4', 't12']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?q=' + encodeURIComponent('ĐÀO'), h)), ['t10']);
    assert.equal((await a.call('GET', '/tasks?q=', h)).json.total, 12);
    assert.deepEqual(ids(await a.call('GET', '/tasks?dueBefore=2026-11-05', h)), ['t1', 't8', 't9', 't12']);
    const due = ids(await a.call('GET', '/tasks?sort=dueDate', h));
    assert.deepEqual(due.slice(-2), ['t3', 't10']);
    const dueDesc = ids(await a.call('GET', '/tasks?sort=-dueDate', h));
    assert.deepEqual(dueDesc.slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?sort=-priority&pageSize=4', h)), ['t4', 't7', 't11', 't3']);
    const p = await a.call('GET', '/tasks?page=2&pageSize=5', h);
    assert.deepEqual([p.json.page, p.json.pageSize, p.json.total], [2, 5, 12]);
    assert.deepEqual(ids(p), ['t6', 't7', 't8', 't9', 't10']);
    const far = await a.call('GET', '/tasks?page=9', h);
    assert.equal(far.status, 200);
    assert.deepEqual([far.json.items.length, far.json.total], [0, 12]);
  }));

test('tham số truy vấn không hợp lệ → 400 INVALID_QUERY', () =>
  withApp(async (a) => {
    const h = { headers: as('u1') };
    for (const [qs, field] of [
      ['status=x', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2026-2-3', 'dueBefore'],
      ['sort=foo', 'sort'], ['page=1.5', 'page'], ['page=0', 'page'], ['pageSize=abc', 'pageSize'], ['pageSize=101', 'pageSize'],
      ['foo=1', 'foo'], ['team=A&team=B', 'team'], ['sort=bad&page=0', 'sort'], ['page=0&sort=bad', 'page'],
    ]) {
      const r = await a.call('GET', '/tasks?' + qs, h);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
    assert.equal((await a.call('GET', '/tasks/export.csv?page=1', h)).status, 400);
    assert.equal((await a.call('GET', '/tasks/export.csv?pageSize=5', h)).json.error.field, 'pageSize');
  }));

test('xuất CSV', () =>
  withApp(async (a) => {
    const r = await a.call('GET', '/tasks/export.csv?sort=-createdAt', { headers: as('u1') });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    // fetch().text() có thể bỏ BOM, nên đọc bytes thô
    const raw = Buffer.from(await (await fetch(a.base + '/tasks/export.csv', { headers: as('u1') })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const text = raw.toString('utf8').slice(1);
    assert.ok(text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(text.endsWith('\r\n'));
    assert.ok(text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,2026-10-07T08:00:00.000Z\r\n'));
    assert.ok(text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done,2,u3,A,2026-10-30,'));
    assert.ok(text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.ok(text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    // member chỉ thấy nhóm mình
    const m = await a.call('GET', '/tasks/export.csv', { headers: as('u4') });
    assert.equal(m.text.includes('t1,'), false);
    assert.equal(m.text.includes('t4,'), true);
  }));

test('nhật ký thao tác', () =>
  withApp(async (a) => {
    await a.call('POST', '/tasks', { headers: as('u1'), body: { title: 'N', team: 'A', priority: 3 } });
    await a.call('PATCH', '/tasks/t13', { headers: as('u1'), body: { title: 'N', priority: 1, status: 'doing' } });
    await a.call('PATCH', '/tasks/t13', { headers: as('u1'), body: { title: '' } }); // lỗi → không ghi
    await a.call('DELETE', '/tasks/t13', { headers: as('u1') });
    const r = await a.call('GET', '/audit', { headers: as('u1') });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(r.json.items.map((e) => e.action), ['delete', 'update', 'create']);
    assert.deepEqual(r.json.items[2].changes, ['priority', 'team', 'title']);
    assert.deepEqual(r.json.items[1].changes, ['priority', 'status']);
    assert.deepEqual(r.json.items[0].changes, []);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal(r.json.items[0].userId, 'u1');
    assert.equal((await a.call('GET', '/audit?taskId=t1', { headers: as('u1') })).json.items.length, 0);
    assert.equal((await a.call('GET', '/audit?taskId=t13', { headers: as('u1') })).json.items.length, 3);
    assert.equal((await a.call('GET', '/audit?x=1', { headers: as('u1') })).json.error.code, 'INVALID_QUERY');
    assert.equal((await a.call('GET', '/audit', { headers: as('u2') })).status, 403);
  }));
