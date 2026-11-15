'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ 'x-user': id });
const NOW = () => new Date('2026-11-01T00:00:00Z');
const users = [
  { id: 'a', role: 'admin', team: null },
  { id: 'm', role: 'manager', team: 'A' },
  { id: 'u', role: 'member', team: 'A' },
  { id: 'v', role: 'member', team: 'B' },
];
const mk = (id, over) => ({ id, title: 'T' + id, status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-10-01T00:00:00.000Z', ...over });
const seed = {
  users,
  tasks: [
    mk('t1', { title: 'a,b "q"\nx' }),
    mk('t2', { title: '=SUM(A1)', assignee: 'u' }),
    mk('t3', { title: '+1', team: 'B' }),
    mk('t4', { title: '-x' }),
    mk('t5', { title: '@x' }),
    mk('t6', { title: '\tx' }),
    mk('t7', { title: '\rx' }),
    mk('t8', { title: 'plain', priority: 3 }),
  ],
};

async function withApp(fn) {
  const app = await start({ seed, now: NOW });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('CSV: header, BOM, tiêu đề, CRLF, RFC 4180, chống công thức, null', () =>
  withApp(async (a) => {
    const r = await a.call('GET', '/tasks/export.csv', { headers: as('a') });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(a.base + "/tasks/export.csv", { headers: as("a") })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // fetch.text() tự bỏ BOM nên kiểm tra byte thô
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t1,"a,b ""q""\nx",todo,2,,A,,2026'));
    assert.ok(r.text.includes("t2,'=SUM(A1),todo,2,u,A,,"));
    assert.ok(r.text.includes("t3,'+1,"));
    assert.ok(r.text.includes("t4,'-x,"));
    assert.ok(r.text.includes("t5,'@x,"));
    assert.ok(r.text.includes("t6,'\tx,"));
    assert.ok(r.text.includes('t7,"\'\rx",'));
    assert.ok(r.text.includes('t8,plain,todo,3,'));
  }));

test('CSV: page/pageSize → 400, member bị lọc nhóm, bộ lọc áp dụng, không bị /tasks/:id nuốt', () =>
  withApp(async (a) => {
    for (const p of ['page=1', 'pageSize=5']) {
      const r = await a.call('GET', '/tasks/export.csv?' + p, { headers: as('a') });
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, p.split('=')[0]);
    }
    const m = await a.call('GET', '/tasks/export.csv', { headers: as('v') });
    assert.equal(m.text.split('\r\n').length, 3); // tiêu đề + t3 + rỗng cuối
    assert.ok(m.text.includes('t3,'));
    const f = await a.call('GET', '/tasks/export.csv?assignee=u&sort=-title', { headers: as('a') });
    assert.equal(f.text.split('\r\n').length, 3);
    assert.equal((await a.call('GET', '/tasks/export.csv')).status, 401);
  }));

test('audit: seq, at, changes a→z, create/update/delete', () =>
  withApp(async (a) => {
    const c = await a.call('POST', '/tasks', { headers: as('m'), body: { team: 'A', title: 'N', priority: 1 } });
    assert.equal(c.status, 201);
    const up = await a.call('PATCH', '/tasks/t1', { headers: as('m'), body: { title: 'T1new', status: 'todo', priority: 3 } });
    assert.equal(up.status, 200);
    assert.equal((await a.call('DELETE', '/tasks/t8', { headers: as('a') })).status, 204);
    const r = await a.call('GET', '/audit', { headers: as('a') });
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(r.json.items.map((e) => e.action), ['delete', 'update', 'create']);
    assert.deepEqual(r.json.items[2].changes, ['priority', 'team', 'title']);
    assert.deepEqual(r.json.items[1].changes, ['priority', 'title']); // status không đổi
    assert.deepEqual(r.json.items[0].changes, []);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal(r.json.items[1].userId, 'm');
    const f = await a.call('GET', '/audit?taskId=t1', { headers: as('a') });
    assert.equal(f.json.items.length, 1);
  }));

test('audit: thao tác lỗi không ghi; chỉ admin; tham số lạ → 400', () =>
  withApp(async (a) => {
    await a.call('POST', '/tasks', { body: { title: 'x', team: 'A' } }); // 401
    await a.call('POST', '/tasks', { headers: as('u'), body: { title: 'x', team: 'A' } }); // 403
    await a.call('POST', '/tasks', { headers: as('m'), body: { title: 'x', team: 'B' } }); // 403
    await a.call('POST', '/tasks', { headers: as('m'), body: { title: '', team: 'A' } }); // 400
    await a.call('PATCH', '/tasks/zz', { headers: as('a'), body: { title: 'x' } }); // 404
    await a.call('PATCH', '/tasks/t3', { headers: as('m'), body: { title: 'x' } }); // 403
    await a.call('PATCH', '/tasks/t1', { headers: as('m'), body: { priority: 9 } }); // 400
    await a.call('DELETE', '/tasks/t1', { headers: as('m') }); // 403
    await a.call('DELETE', '/tasks/nope', { headers: as('a') }); // 404
    assert.equal(a.server.store.audit.length, 0);
    assert.equal((await a.call('GET', '/audit', { headers: as('m') })).status, 403);
    assert.equal((await a.call('GET', '/audit?x=1', { headers: as('a') })).json.error.code, 'INVALID_QUERY');
    assert.equal((await a.call('GET', '/audit?taskId=a&taskId=b', { headers: as('a') })).status, 400);
    assert.deepEqual((await a.call('GET', '/audit', { headers: as('a') })).json, { items: [] });
  }));

test('audit: PATCH thành công nhưng không đổi giá trị vẫn ghi 1 mục changes []', () =>
  withApp(async (a) => {
    const r = await a.call('PATCH', '/tasks/t2', { headers: as('u'), body: { status: 'todo' } });
    assert.equal(r.status, 200);
    const e = a.server.store.audit;
    assert.equal(e.length, 1);
    assert.deepEqual(e[0].changes, []);
    assert.equal(e[0].action, 'update');
  }));
