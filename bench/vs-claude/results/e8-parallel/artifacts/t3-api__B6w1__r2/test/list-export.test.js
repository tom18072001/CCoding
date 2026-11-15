'use strict';
// Kiểm tra phần nối dây list/export (chi tiết lọc/CSV có unit test riêng ở module query/csv).
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });

test('GET /tasks: dạng {items,total,page,pageSize} và phân trang', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks?pageSize=5&page=2', { headers: as('u1') });
    assert.equal(r.status, 200);
    assert.equal(r.json.items.length, 5);
    assert.equal(r.json.total, 12);
    assert.equal(r.json.page, 2);
    assert.equal(r.json.pageSize, 5);
    const far = await app.call('GET', '/tasks?page=99', { headers: as('u1') });
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
  } finally {
    await app.close();
  }
});

test('thứ tự: 401 → INVALID_QUERY 400 trước 404/403', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks?status=lạ', { headers: as('u3') });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/tasks?status=lạ')).status, 401);
  } finally {
    await app.close();
  }
});

test('GET /tasks/export.csv: header, BOM, không bị nhầm với :id, member bị khóa nhóm', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv', { headers: as('u1') });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const bytes = new Uint8Array(await (await fetch(app.base + '/tasks/export.csv', { headers: as('u1') })).arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]); // BOM UTF-8 (fetch.text() tự bỏ BOM)
    assert.ok(r.text.endsWith('\r\n'));
    const m = await app.call('GET', '/tasks/export.csv', { headers: as('u3') });
    assert.equal(m.status, 200);
    assert.ok(!m.text.includes('t4'));
    assert.ok(m.text.includes('t1'));
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
    const bad = await app.call('GET', '/tasks/export.csv?page=1', { headers: as('u1') });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.field, 'page');
  } finally {
    await app.close();
  }
});
