'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });
// u1 admin · u2 manager A · u3 member A (giao t1,t2) · u4 member B · u5 manager B

async function withApp(fn, opts = { now: () => new Date('2026-11-01T00:00:00Z') }) {
  const app = await start(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('xác thực: thiếu/sai X-User → 401, ưu tiên trước 400/404', () =>
  withApp(async (a) => {
    for (const h of [{}, as('nobody')]) {
      const r = await a.call('GET', '/tasks?sort=bad', { headers: h });
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await a.call('GET', '/audit')).status, 401);
    assert.equal((await a.call('GET', '/tasks/zzz')).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (a) => {
    const list = await a.call('GET', '/tasks?team=B', { headers: as('u3') });
    assert.deepEqual(list.json.items, []);
    const own = await a.call('GET', '/tasks', { headers: as('u3') });
    assert.ok(own.json.items.every((t) => t.team === 'A'));
    const other = a.store;
    const tB = [...(await a.call('GET', '/tasks?team=B', { headers: as('u1') })).json.items][0];
    for (const m of ['GET', 'DELETE']) assert.equal((await a.call(m, `/tasks/${tB.id}`, { headers: as('u3') })).status, 404);
    assert.equal((await a.call('PATCH', `/tasks/${tB.id}`, { headers: as('u3'), body: { status: 'done' } })).status, 404);
    assert.equal((await a.call('POST', '/tasks', { headers: as('u3'), body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t1', { headers: as('u3') })).status, 403);
    // t1 giao cho u3
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'doing' } })).status, 200);
    const same = await a.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'doing', title: 'Thiết kế cơ sở dữ liệu' } });
    assert.equal(same.status, 403);
    assert.equal(same.json.error.code, 'FORBIDDEN');
    assert.equal((await a.call('PATCH', '/tasks/t3', { headers: as('u3'), body: { status: 'doing' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'bad' } })).status, 400);
    void other;
  }));

test('phân quyền manager', () =>
  withApp(async (a) => {
    assert.equal((await a.call('POST', '/tasks', { headers: as('u2'), body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { headers: as('u2'), body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { team: 'B' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { title: 'Mới' } })).status, 200);
    assert.equal((await a.call('DELETE', '/tasks/t1', { headers: as('u2') })).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/zzz', { headers: as('u2') })).status, 404);
    const all = await a.call('GET', '/tasks?pageSize=100', { headers: as('u2') });
    assert.ok(all.json.items.some((t) => t.team === 'B'));
    const tB = all.json.items.find((t) => t.team === 'B');
    assert.equal((await a.call('PATCH', `/tasks/${tB.id}`, { headers: as('u2'), body: { title: 'y' } })).status, 403);
    // 403 trước validate
    assert.equal((await a.call('PATCH', `/tasks/${tB.id}`, { headers: as('u2'), body: { title: '' } })).status, 403);
  }));

test('truy vấn: lọc, tìm không dấu, sắp xếp, phân trang', () =>
  withApp(async (a) => {
    const g = (q) => a.call('GET', '/tasks' + q, { headers: as('u1') });
    const all = await g('?pageSize=100');
    assert.equal(all.json.total, 12);
    assert.equal(all.json.page, 1);
    assert.equal(all.json.pageSize, 100);
    const vn = await g('?q=' + encodeURIComponent('thiet ke co so du lieu'));
    assert.deepEqual(vn.json.items.map((t) => t.id), ['t1']);
    assert.equal((await g('?q=DANG NHAP')).json.total, 1);
    assert.equal((await g('?q=')).json.total, 12);
    const st = await g('?status=todo,doing');
    assert.ok(st.json.items.every((t) => t.status !== 'done'));
    const none = await g('?assignee=none');
    assert.ok(none.json.items.every((t) => t.assignee === null));
    const due = await g('?dueBefore=2026-11-10&pageSize=100');
    assert.ok(due.json.items.every((t) => t.dueDate && t.dueDate <= '2026-11-10'));
    for (const s of ['dueDate', '-dueDate']) {
      const items = (await g(`?sort=${s}&pageSize=100`)).json.items;
      const idx = items.findIndex((t) => !t.dueDate);
      assert.ok(items.slice(idx).every((t) => !t.dueDate), s);
    }
    const pri = (await g('?sort=-priority&pageSize=100')).json.items;
    for (let i = 1; i < pri.length; i++) {
      assert.ok(pri[i - 1].priority >= pri[i].priority);
      if (pri[i - 1].priority === pri[i].priority) assert.ok(Number(pri[i - 1].id.slice(1)) < Number(pri[i].id.slice(1)));
    }
    const p2 = await g('?pageSize=5&page=3');
    assert.equal(p2.json.items.length, 2);
    assert.equal((await g('?page=99')).json.items.length, 0);
    assert.equal((await g('?page=99')).json.total, 12);
  }));

test('truy vấn: lỗi INVALID_QUERY', () =>
  withApp(async (a) => {
    const cases = [
      ['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?dueBefore=2026-2-3', 'dueBefore'],
      ['?sort=foo', 'sort'], ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=abc', 'pageSize'], ['?pageSize=101', 'pageSize'],
      ['?zzz=1', 'zzz'], ['?team=A&team=A', 'team'], ['?team=C&page=0', 'team'], ['?page=0&team=C', 'page'],
    ];
    for (const [q, f] of cases) {
      const r = await a.call('GET', '/tasks' + q, { headers: as('u1') });
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, f, q);
    }
    // 400 trước 404 (id không tồn tại không liên quan) và export không nhận page
    const e = await a.call('GET', '/tasks/export.csv?page=1', { headers: as('u1') });
    assert.equal(e.json.error.field, 'page');
  }));

test('xuất CSV', () =>
  withApp(async (a) => {
    const c = await a.call('POST', '/tasks', { headers: as('u1'), body: { title: '=1+1, "x"\nz', team: 'B', priority: 3 } });
    assert.equal(c.status, 201);
    await a.call('POST', '/tasks', { headers: as('u1'), body: { title: '-a', team: 'B' } });
    const r = await a.call('GET', '/tasks/export.csv?team=B&sort=-createdAt', { headers: as('u1') });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(a.base + '/tasks/export.csv?team=B', { headers: as('u1') })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // fetch().text() tự bỏ BOM
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes(`${c.json.id},"'=1+1, ""x""\nz",todo,3,,B,,2026-11-01T00:00:00.000Z\r\n`));
    assert.ok(r.text.includes(",\"'-a\"") === false && r.text.includes(",'-a,"));
    const m = await a.call('GET', '/tasks/export.csv', { headers: as('u3') });
    assert.ok(!m.text.includes(',B,'));
  }));

test('nhật ký thao tác', () =>
  withApp(async (a) => {
    await a.call('POST', '/tasks', { headers: as('u1'), body: { title: 'n', team: 'A' } });
    await a.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { status: 'done', title: 'Mới', priority: 1 } });
    await a.call('POST', '/tasks', { headers: as('u1'), body: { title: '', team: 'A' } }); // lỗi → không ghi
    await a.call('DELETE', '/tasks/t13', { headers: as('u1') });
    assert.equal((await a.call('GET', '/audit', { headers: as('u2') })).status, 403);
    assert.equal((await a.call('GET', '/audit?x=1', { headers: as('u2') })).status, 400);
    const r = await a.call('GET', '/audit', { headers: as('u1') });
    const at = '2026-11-01T00:00:00.000Z';
    assert.deepEqual(r.json.items, [
      { seq: 3, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
      { seq: 2, at, userId: 'u2', action: 'update', taskId: 't1', changes: ['title'] },
      { seq: 1, at, userId: 'u1', action: 'create', taskId: 't13', changes: ['team', 'title'] },
    ]);
    const f = await a.call('GET', '/audit?taskId=t1', { headers: as('u1') });
    assert.equal(f.json.items.length, 1);
  }));
