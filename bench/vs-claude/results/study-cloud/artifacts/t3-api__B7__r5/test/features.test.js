'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

async function withApp(fn, opts = {}) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z'), ...opts });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('xác thực: thiếu/sai X-User → 401', () =>
  withApp(async (a) => {
    for (const user of [null, 'zzz']) {
      const r = await a.call('GET', '/tasks', { user });
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await a.call('GET', '/audit', { user: null })).status, 401);
    // 401 đi trước 400
    assert.equal((await a.call('GET', '/tasks?bogus=1', { user: null })).status, 401);
  }));

test('phân quyền member/manager', () =>
  withApp(async (a) => {
    const all = (await a.call('GET', '/tasks?pageSize=100', { user: 'u3' })).json;
    assert.ok(all.total > 0 && all.items.every((t) => t.team === 'A'));
    const other = (await a.call('GET', '/tasks?pageSize=100&team=B', { user: 'u3' })).json;
    assert.equal(other.total, 0);
    const bTask = (await a.call('GET', '/tasks?team=B')).json.items[0];
    for (const m of ['GET', 'DELETE']) assert.equal((await a.call(m, `/tasks/${bTask.id}`, { user: 'u3' })).status, 404);
    assert.equal((await a.call('PATCH', `/tasks/${bTask.id}`, { user: 'u3', body: { status: 'done' } })).status, 404);
    assert.equal((await a.call('POST', '/tasks', { user: 'u3', body: { title: 'x', team: 'A' } })).status, 403);
    const mine = all.items.find((t) => t.assignee === 'u3');
    const notMine = all.items.find((t) => t.assignee !== 'u3');
    assert.equal((await a.call('PATCH', `/tasks/${notMine.id}`, { user: 'u3', body: { status: 'done' } })).status, 403);
    assert.equal((await a.call('PATCH', `/tasks/${mine.id}`, { user: 'u3', body: { status: mine.status } })).status, 200);
    assert.equal((await a.call('PATCH', `/tasks/${mine.id}`, { user: 'u3', body: { status: 'done', title: 'y' } })).status, 403);
    assert.equal((await a.call('DELETE', `/tasks/${mine.id}`, { user: 'u3' })).status, 403);
    // manager
    assert.equal((await a.call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await a.call('GET', `/tasks/${bTask.id}`, { user: 'u2' })).status, 200);
    assert.equal((await a.call('PATCH', `/tasks/${bTask.id}`, { user: 'u2', body: { title: 'z' } })).status, 403);
    assert.equal((await a.call('PATCH', `/tasks/${mine.id}`, { user: 'u2', body: { team: 'B' } })).status, 403);
    assert.equal((await a.call('PATCH', `/tasks/${mine.id}`, { user: 'u2', body: { title: '' } })).status, 400);
    assert.equal((await a.call('DELETE', `/tasks/${mine.id}`, { user: 'u2' })).status, 403);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (a) => {
    const q = async (s) => (await a.call('GET', '/tasks' + s)).json;
    const base = await q('?pageSize=100');
    assert.equal(base.page, 1);
    assert.equal(base.pageSize, 100);
    assert.equal((await q('?page=99')).items.length, 0);
    assert.equal((await q('?page=99')).total, base.total);
    const du = await q('?sort=-dueDate&pageSize=100');
    const dues = du.items.map((t) => t.dueDate);
    const firstNull = dues.indexOf(null);
    if (firstNull >= 0) assert.ok(dues.slice(firstNull).every((d) => d === null));
    const ids = (await q('?sort=priority&pageSize=100')).items;
    for (let i = 1; i < ids.length; i++) assert.ok(ids[i - 1].priority <= ids[i].priority);
    // q không phân biệt dấu/hoa thường, đ → d
    const t = (await q('?q=THIET%20KE%20CO%20SO%20DU%20LIEU')).items;
    assert.ok(t.some((x) => x.title === 'Thiết kế cơ sở dữ liệu'));
    assert.equal((await q('?q=')).total, base.total);
    assert.equal((await q('?assignee=none')).items.every((x) => x.assignee === null), true);
    assert.equal((await q('?status=todo,doing')).items.every((x) => x.status !== 'done'), true);
    assert.equal((await q('?dueBefore=2026-11-05')).items.every((x) => x.dueDate && x.dueDate <= '2026-11-05'), true);
    // lỗi
    for (const [qs, field] of [
      ['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'],
      ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?zzz=1', 'zzz'], ['?page=1&page=2', 'page'],
      ['?sort=foo&page=0', 'sort'], ['?page=0&sort=foo', 'page'],
    ]) {
      const r = await a.call('GET', '/tasks' + qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  }));

test('sắp xếp hòa theo id số', () =>
  withApp(async (a) => {
    const r = (await a.call('GET', '/tasks?sort=-priority&pageSize=100')).json.items;
    for (let i = 1; i < r.length; i++)
      if (r[i - 1].priority === r[i].priority) assert.ok(Number(r[i - 1].id.slice(1)) < Number(r[i].id.slice(1)));
  }));

test('xuất CSV', () =>
  withApp(async (a) => {
    const seed = {
      users: [{ id: 'u1', role: 'admin', team: null }],
      tasks: [
        { id: 't1', title: '=SUM(A1)', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-10-01T00:00:00.000Z' },
        { id: 't2', title: 'a, "b"', status: 'todo', priority: 2, assignee: 'u1', team: 'A', dueDate: '2026-11-01', createdAt: '2026-10-02T00:00:00.000Z' },
      ],
    };
    const b = await start({ seed });
    try {
      const r = await b.call('GET', '/tasks/export.csv');
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
      assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
      assert.equal(
        r.text,
        'id,title,status,priority,assignee,team,dueDate,createdAt\r\n' +
          "t1,'=SUM(A1),todo,1,,A,,2026-10-01T00:00:00.000Z\r\n" +
          't2,"a, ""b""",todo,2,u1,A,2026-11-01,2026-10-02T00:00:00.000Z\r\n',
      );
      // fetch().text() tự bỏ BOM nên kiểm tra byte thô
      const raw = Buffer.from(await (await fetch(b.base + '/tasks/export.csv', { headers: { 'x-user': 'u1' } })).arrayBuffer());
      assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      assert.equal((await b.call('GET', '/tasks/export.csv?page=1')).json.error.field, 'page');
    } finally {
      await b.close();
    }
    assert.equal((await a.call('GET', '/tasks/export.csv', { user: 'u3' })).text.split('\r\n').length > 2, true);
  }));

test('nhật ký thao tác', () =>
  withApp(async (a) => {
    await a.call('POST', '/tasks', { body: { title: 'N', team: 'A' } });
    await a.call('PATCH', '/tasks/t13', { body: { status: 'doing', title: 'N' } });
    await a.call('PATCH', '/tasks/t13', { body: { title: '' } }); // lỗi, không ghi
    await a.call('DELETE', '/tasks/t13');
    const r = await a.call('GET', '/audit');
    assert.deepEqual(
      r.json.items.map((e) => [e.seq, e.action, e.changes]),
      [[3, 'delete', []], [2, 'update', ['status']], [1, 'create', ['team', 'title']]],
    );
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal(r.json.items[0].userId, 'u1');
    assert.equal((await a.call('GET', '/audit?taskId=t1')).json.items.length, 0);
    assert.equal((await a.call('GET', '/audit?x=1')).status, 400);
    assert.equal((await a.call('GET', '/audit', { user: 'u2' })).status, 403);
  }));
