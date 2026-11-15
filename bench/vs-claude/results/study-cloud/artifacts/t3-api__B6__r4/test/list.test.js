'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });
const ADMIN = as('u1');
const mk = (id, title, status, priority, assignee, team, dueDate, createdAt) => ({ id, title, status, priority, assignee, team, dueDate, createdAt: `${createdAt}T00:00:00.000Z` });
const seed = () => ({
  users: [
    { id: 'u1', name: 'Admin', role: 'admin', team: null },
    { id: 'u2', name: 'Mgr A', role: 'manager', team: 'A' },
    { id: 'u3', name: 'Mem A', role: 'member', team: 'A' },
    { id: 'u4', name: 'Mem B', role: 'member', team: 'B' },
  ],
  tasks: [
    mk('t1', 'Thiết kế', 'todo', 2, 'u3', 'A', '2026-03-01', '2026-01-01'),
    mk('t2', 'Đường dẫn', 'done', 1, null, 'A', null, '2026-01-02'),
    mk('t10', 'dao động', 'doing', 1, 'u4', 'B', null, '2026-01-02'),
    mk('t3', 'Zebra', 'todo', 3, 'u3', 'A', '2026-02-15', '2026-01-03'),
    mk('t4', 'Ánh sáng', 'doing', 2, null, 'B', '2026-02-15', '2026-01-04'),
  ],
});
async function withApp(fn) {
  const app = await start({ seed: seed(), now: () => new Date('2026-05-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);
const list = (app, qs, h = ADMIN) => app.call('GET', `/tasks${qs}`, { headers: h });

test('dạng kết quả mặc định', async () => {
  await withApp(async (app) => {
    const r = await list(app, '');
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 5);
    assert.equal(r.json.page, 1);
    assert.equal(r.json.pageSize, 20);
    assert.deepEqual(ids(r), ['t1', 't2', 't10', 't3', 't4']); // createdAt tăng, hòa theo id số
  });
});

test('lọc status một/nhiều giá trị', async () => {
  await withApp(async (app) => {
    assert.deepEqual(ids(await list(app, '?status=done')), ['t2']);
    const r = await list(app, '?status=todo,doing');
    assert.deepEqual(ids(r), ['t1', 't10', 't3', 't4']);
    assert.equal(r.json.total, 4);
  });
});

test('lọc assignee, assignee=none, team', async () => {
  await withApp(async (app) => {
    assert.deepEqual(ids(await list(app, '?assignee=u3')), ['t1', 't3']);
    assert.deepEqual(ids(await list(app, '?assignee=none')), ['t2', 't4']);
    assert.deepEqual(ids(await list(app, '?team=B')), ['t10', 't4']);
    assert.deepEqual(ids(await list(app, '?team=A&status=todo&assignee=u3')), ['t1', 't3']);
  });
});

test('q không phân biệt hoa/thường, dấu, đ; q rỗng = không lọc', async () => {
  await withApp(async (app) => {
    assert.deepEqual(ids(await list(app, '?q=thiet')), ['t1']);
    assert.deepEqual(ids(await list(app, '?q=' + encodeURIComponent('THIẾT'))), ['t1']);
    assert.deepEqual(ids(await list(app, '?q=duong')), ['t2']);
    assert.deepEqual(ids(await list(app, '?q=' + encodeURIComponent('ĐƯỜNG'))), ['t2']);
    assert.deepEqual(ids(await list(app, '?q=dong')), ['t10']);
    assert.deepEqual(ids(await list(app, '?q=' + encodeURIComponent('đ'))), ['t2', 't10']);
    assert.deepEqual(ids(await list(app, '?q=anh%20sang')), ['t4']);
    assert.deepEqual(ids(await list(app, '?q=khongco')), []);
    assert.equal((await list(app, '?q=')).json.total, 5);
  });
});

test('dueBefore: ≤ ngày, loại null; ngày sai → 400', async () => {
  await withApp(async (app) => {
    assert.deepEqual(ids(await list(app, '?dueBefore=2026-02-15')), ['t3', 't4']);
    assert.deepEqual(ids(await list(app, '?dueBefore=2026-03-01')), ['t1', 't3', 't4']);
    assert.deepEqual(ids(await list(app, '?dueBefore=2026-02-14')), []);
    for (const v of ['2026-02-30', '2026-13-01', '2026-2-1', 'abc', '']) {
      const r = await list(app, `?dueBefore=${v}`);
      assert.equal(r.status, 400, v);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, 'dueBefore');
    }
  });
});

test('sort từng trường, hòa theo id số bất kể chiều', async () => {
  await withApp(async (app) => {
    assert.deepEqual(ids(await list(app, '?sort=createdAt')), ['t1', 't2', 't10', 't3', 't4']);
    assert.deepEqual(ids(await list(app, '?sort=-createdAt')), ['t4', 't3', 't2', 't10', 't1']);
    assert.deepEqual(ids(await list(app, '?sort=priority')), ['t2', 't10', 't1', 't4', 't3']);
    assert.deepEqual(ids(await list(app, '?sort=-priority')), ['t3', 't1', 't4', 't2', 't10']);
  });
});

test('sort dueDate: null luôn cuối cả hai chiều', async () => {
  await withApp(async (app) => {
    assert.deepEqual(ids(await list(app, '?sort=dueDate')), ['t3', 't4', 't1', 't2', 't10']);
    assert.deepEqual(ids(await list(app, '?sort=-dueDate')), ['t1', 't3', 't4', 't2', 't10']);
  });
});

test('sort title theo locale vi', async () => {
  await withApp(async (app) => {
    const exp = ['Ánh sáng', 'dao động', 'Đường dẫn', 'Thiết kế', 'Zebra'];
    const r = await list(app, '?sort=title');
    assert.deepEqual(r.json.items.map((t) => t.title), exp);
    const d = await list(app, '?sort=-title');
    assert.deepEqual(d.json.items.map((t) => t.title), [...exp].reverse());
  });
});

test('phân trang và biên', async () => {
  await withApp(async (app) => {
    const p1 = await list(app, '?pageSize=2&page=1');
    assert.deepEqual(ids(p1), ['t1', 't2']);
    assert.equal(p1.json.total, 5);
    assert.equal(p1.json.pageSize, 2);
    assert.deepEqual(ids(await list(app, '?pageSize=2&page=3')), ['t4']);
    const over = await list(app, '?pageSize=2&page=4');
    assert.equal(over.status, 200);
    assert.deepEqual(over.json.items, []);
    assert.equal(over.json.total, 5);
    assert.equal(over.json.page, 4);
    assert.equal((await list(app, '?pageSize=100')).status, 200);
    assert.equal((await list(app, '?pageSize=1')).json.items.length, 1);
    assert.equal((await list(app, '?status=done&page=2')).json.total, 1);
  });
});

test('giá trị không hợp lệ → 400 INVALID_QUERY đúng field', async () => {
  await withApp(async (app) => {
    const bad = [
      ['status=x', 'status'], ['status=todo,x', 'status'], ['status=', 'status'], ['team=C', 'team'], ['team=a', 'team'],
      ['sort=id', 'sort'], ['sort=--title', 'sort'], ['sort=', 'sort'],
      ['page=0', 'page'], ['page=1.5', 'page'], ['page=abc', 'page'], ['page=-1', 'page'],
      ['pageSize=0', 'pageSize'], ['pageSize=101', 'pageSize'], ['pageSize=1.5', 'pageSize'], ['pageSize=abc', 'pageSize'],
    ];
    for (const [qs, field] of bad) {
      const r = await list(app, `?${qs}`);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY', qs);
      assert.equal(r.json.error.field, field, qs);
    }
  });
});

test('tham số lạ hoặc lặp → 400 field đúng', async () => {
  await withApp(async (app) => {
    let r = await list(app, '?foo=1');
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'foo');
    r = await list(app, '?status=todo&status=done');
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'status');
    r = await list(app, '?page=1&page=2');
    assert.equal(r.json.error.field, 'page');
  });
});

test('nhiều lỗi → báo tham số đầu tiên theo thứ tự URL', async () => {
  await withApp(async (app) => {
    assert.equal((await list(app, '?pageSize=0&status=x&foo=1')).json.error.field, 'pageSize');
    assert.equal((await list(app, '?status=x&pageSize=0')).json.error.field, 'status');
    assert.equal((await list(app, '?foo=1&team=C')).json.error.field, 'foo');
    assert.equal((await list(app, '?team=C&foo=1')).json.error.field, 'team');
    assert.equal((await list(app, '?sort=bad&dueBefore=2026-02-30&page=0')).json.error.field, 'sort');
    assert.equal((await list(app, '?page=0&sort=bad')).json.error.field, 'page');
  });
});

test('member: tự lọc nhóm mình; team khác → rỗng, không lỗi; total theo nhóm', async () => {
  await withApp(async (app) => {
    const r = await list(app, '', as('u3'));
    assert.deepEqual(ids(r), ['t1', 't2', 't3']);
    assert.equal(r.json.total, 3);
    const other = await list(app, '?team=B', as('u3'));
    assert.equal(other.status, 200);
    assert.deepEqual(other.json.items, []);
    assert.equal(other.json.total, 0);
    assert.deepEqual(ids(await list(app, '?team=A', as('u3'))), ['t1', 't2', 't3']);
    assert.deepEqual(ids(await list(app, '', as('u4'))), ['t10', 't4']);
  });
});

test('manager thấy mọi nhóm', async () => {
  await withApp(async (app) => {
    assert.equal((await list(app, '', as('u2'))).json.total, 5);
    assert.deepEqual(ids(await list(app, '?team=B', as('u2'))), ['t10', 't4']);
  });
});
