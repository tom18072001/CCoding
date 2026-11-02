'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });

test('GET /tasks: lọc, phân trang, total', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks?pageSize=5&page=2&sort=-priority', { headers: as('u1') });
    assert.equal(r.status, 200);
    assert.equal(r.json.items.length, 5);
    assert.equal(r.json.total, 12);
    assert.equal(r.json.page, 2);
    assert.equal(r.json.pageSize, 5);
    const beyond = await app.call('GET', '/tasks?page=99', { headers: as('u1') });
    assert.deepEqual(beyond.json.items, []);
    assert.equal(beyond.json.total, 12);
    const byTeam = await app.call('GET', '/tasks?team=B', { headers: as('u1') });
    assert.ok(byTeam.json.items.every((t) => t.team === 'B'));
    const dup = await app.call('GET', '/tasks?team=A&team=B', { headers: as('u1') });
    assert.equal(dup.status, 400);
    assert.equal(dup.json.error.field, 'team');
  } finally {
    await app.close();
  }
});

test('GET /tasks/export.csv: header, BOM, CRLF, quyền member', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv', { headers: as('u1') });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    // fetch().text() tự bỏ BOM nên kiểm tra byte thô
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', { headers: as('u1') })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.equal(r.text.split('\r\n').length, 14); // tiêu đề + 12 dòng + phần rỗng cuối
    const m = await app.call('GET', '/tasks/export.csv', { headers: as('u4') });
    const lines = m.text.split('\r\n').filter(Boolean).slice(1);
    assert.ok(lines.length > 0 && lines.every((l) => l.split(',').includes('B') || l.includes(',B,')));
    const bad = await app.call('GET', '/tasks/export.csv?pageSize=5', { headers: as('u1') });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.field, 'pageSize');
  } finally {
    await app.close();
  }
});
