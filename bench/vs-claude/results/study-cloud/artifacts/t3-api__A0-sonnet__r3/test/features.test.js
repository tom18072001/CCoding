'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const clock = () => new Date('2026-11-01T00:00:00Z');
async function withApp(fn) {
  const app = await start({ now: clock });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('xác thực: thiếu/sai X-User → 401', () =>
  withApp(async (a) => {
    for (const path of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
      for (const user of [null, 'zzz']) {
        const r = await a.call('GET', path, { user });
        assert.equal(r.status, 401);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
    // 401 đi trước 400
    assert.equal((await a.call('GET', '/tasks?bogus=1', { user: null })).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (a) => {
    const mine = (await a.call('GET', '/tasks', { user: 'u3' })).json;
    assert.ok(mine.total > 0 && mine.items.every((t) => t.team === 'A'));
    const other = a.call('GET', '/tasks/' + (await a.call('GET', '/tasks?team=B')).json.items[0].id, { user: 'u3' });
    assert.equal((await other).status, 404);
    assert.equal((await a.call('GET', '/tasks?team=B', { user: 'u3' })).json.total, 0);
    assert.equal((await a.call('POST', '/tasks', { user: 'u3', body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t1', { user: 'u3' })).status, 403);
    const bId = (await a.call('GET', '/tasks?team=B')).json.items[0].id;
    assert.equal((await a.call('DELETE', '/tasks/' + bId, { user: 'u3' })).status, 404);
    assert.equal((await a.call('PATCH', '/tasks/' + bId, { user: 'u3', body: { status: 'done' } })).status, 404);
    // t1 giao cho u3
    assert.equal((await a.call('PATCH', '/tasks/t1', { user: 'u3', body: { title: 'k' } })).status, 403);
    const same = await a.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'done', priority: 1 } });
    assert.equal(same.status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'todo' } })).status, 200);
    assert.equal((await a.call('PATCH', '/tasks/t1', { user: 'u6', body: { status: 'todo' } })).status, 403);
  }));

test('phân quyền manager', () =>
  withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks', { user: 'u2' })).json.total, 12);
    assert.equal((await a.call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'A' } })).status, 201);
    const bId = (await a.call('GET', '/tasks?team=B')).json.items[0].id;
    assert.equal((await a.call('PATCH', '/tasks/' + bId, { user: 'u2', body: { title: 'y' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { user: 'u2', body: { team: 'B' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { user: 'u2', body: { title: 'y' } })).status, 200);
    assert.equal((await a.call('DELETE', '/tasks/t1', { user: 'u2' })).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t1')).status, 204);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (a) => {
    const all = (await a.call('GET', '/tasks?pageSize=100')).json;
    assert.equal(all.page, 1);
    assert.equal(all.pageSize, 100);
    const p2 = (await a.call('GET', '/tasks?pageSize=5&page=3')).json;
    assert.equal(p2.items.length, 2);
    assert.equal(p2.total, 12);
    assert.deepEqual((await a.call('GET', '/tasks?page=99')).json.items, []);
    const st = (await a.call('GET', '/tasks?status=todo,doing')).json;
    assert.ok(st.items.every((t) => t.status !== 'done'));
    const none = (await a.call('GET', '/tasks?assignee=none')).json;
    assert.ok(none.items.length > 0 && none.items.every((t) => t.assignee === null));
    const q = (await a.call('GET', '/tasks?q=' + encodeURIComponent('DANG NHAP'))).json;
    assert.ok(q.items.some((t) => t.id === 't2'));
    assert.equal((await a.call('GET', '/tasks?q=' + encodeURIComponent('đăng'))).json.items.some((t) => t.id === 't2'), true);
    assert.equal((await a.call('GET', '/tasks?q=')).json.total, 12);
    const d = (await a.call('GET', '/tasks?dueBefore=2026-11-05')).json;
    assert.ok(d.items.every((t) => t.dueDate && t.dueDate <= '2026-11-05'));
    for (const s of ['dueDate', '-dueDate']) {
      const items = (await a.call('GET', '/tasks?sort=' + s)).json.items;
      const firstNull = items.findIndex((t) => t.dueDate === null);
      assert.ok(items.slice(firstNull).every((t) => t.dueDate === null));
    }
    const pr = (await a.call('GET', '/tasks?sort=-priority')).json.items;
    for (let i = 1; i < pr.length; i++) {
      assert.ok(pr[i - 1].priority >= pr[i].priority);
      if (pr[i - 1].priority === pr[i].priority) assert.ok(Number(pr[i - 1].id.slice(1)) < Number(pr[i].id.slice(1)));
    }
  }));

test('tham số truy vấn không hợp lệ', () =>
  withApp(async (a) => {
    for (const [qs, field] of [
      ['status=x', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=26-1-1', 'dueBefore'],
      ['sort=foo', 'sort'], ['page=1.5', 'page'], ['page=0', 'page'], ['pageSize=abc', 'pageSize'], ['pageSize=101', 'pageSize'],
      ['foo=1', 'foo'], ['team=A&team=B', 'team'], ['sort=title&page=0&team=Z', 'page'],
    ]) {
      const r = await a.call('GET', '/tasks?' + qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
    assert.equal((await a.call('GET', '/tasks/export.csv?page=1')).json.error.field, 'page');
    // 400 query đi trước 404
    assert.equal((await a.call('GET', '/tasks/nope?x=1')).status, 404);
  }));

test('xuất CSV', async () => {
  const seed = {
    users: [{ id: 'u1', role: 'admin', team: null }, { id: 'u3', role: 'member', team: 'A' }],
    tasks: [
      { id: 't1', title: '=cmd, "x"', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 't2', title: 'ok\nline', status: 'todo', priority: 2, assignee: 'u3', team: 'B', dueDate: '2026-02-02', createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 't3', title: '-a', status: 'done', priority: 3, assignee: 'u3', team: 'A', dueDate: null, createdAt: '2026-01-03T00:00:00.000Z' },
    ],
  };
  const a = await start({ seed });
  try {
    const raw = Buffer.from(await (await fetch(a.base + '/tasks/export.csv', { headers: { 'x-user': 'u1' } })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const r = await a.call('GET', '/tasks/export.csv'); // fetch.text() bỏ BOM
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.equal(
      r.text,
      'id,title,status,priority,assignee,team,dueDate,createdAt\r\n' +
        't1,"\'=cmd, ""x""",todo,1,,A,,2026-01-01T00:00:00.000Z\r\n' +
        't2,"ok\nline",todo,2,u3,B,2026-02-02,2026-01-02T00:00:00.000Z\r\n' +
        "t3,'-a,done,3,u3,A,,2026-01-03T00:00:00.000Z\r\n",
    );
    const m = await a.call('GET', '/tasks/export.csv?sort=-title', { user: 'u3' });
    assert.equal(m.text.split('\r\n').length, 4); // header + 2 + trailing
  } finally {
    await a.close();
  }
});

test('nhật ký thao tác', () =>
  withApp(async (a) => {
    await a.call('POST', '/tasks', { body: { title: 'N', team: 'A' } });
    await a.call('POST', '/tasks', { body: { title: '', team: 'A' } }); // lỗi, không ghi
    await a.call('PATCH', '/tasks/t13', { body: { title: 'N', status: 'doing', priority: 3 } });
    await a.call('DELETE', '/tasks/t13');
    const r = await a.call('GET', '/audit');
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.changes]), [
      [3, 'delete', []],
      [2, 'update', ['priority', 'status']],
      [1, 'create', ['team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal(r.json.items[0].userId, 'u1');
    assert.equal(r.json.items[0].taskId, 't13');
    assert.equal((await a.call('GET', '/audit?taskId=t99')).json.items.length, 0);
    assert.equal((await a.call('GET', '/audit?x=1')).json.error.code, 'INVALID_QUERY');
    assert.equal((await a.call('GET', '/audit', { user: 'u2' })).status, 403);
  }));
