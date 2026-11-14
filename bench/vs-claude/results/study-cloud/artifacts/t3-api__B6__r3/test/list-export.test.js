'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, as, ADMIN } = require('./helpers');

async function withApp(fn) {
  const app = await start();
  try {
    await fn(app.call);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);

test('GET /tasks: dạng kết quả, lọc, sắp xếp, phân trang', () =>
  withApp(async (call) => {
    const r = await call('GET', '/tasks?pageSize=5&page=3', { headers: ADMIN });
    assert.deepEqual([r.json.total, r.json.page, r.json.pageSize], [12, 3, 5]);
    assert.deepEqual(ids(r), ['t11', 't12']);
    assert.deepEqual(ids(await call('GET', '/tasks?page=9', { headers: ADMIN })), []);
    assert.deepEqual(ids(await call('GET', '/tasks?status=done&team=A', { headers: ADMIN })), ['t1', 't8']);
    assert.deepEqual(ids(await call('GET', '/tasks?assignee=none&sort=-createdAt', { headers: ADMIN })), ['t11', 't6']);
    assert.deepEqual(ids(await call('GET', '/tasks?q=dac%20ta', { headers: ADMIN })), ['t4', 't12']);
    assert.deepEqual(ids(await call('GET', '/tasks?dueBefore=2026-11-01&sort=dueDate', { headers: ADMIN })), ['t8', 't12']);
    assert.deepEqual(ids(await call('GET', '/tasks?team=B&sort=-dueDate', { headers: ADMIN })), ['t4', 't5', 't6', 't12', 't10']);
  }));

test('GET /tasks: lỗi query theo thứ tự xuất hiện', () =>
  withApp(async (call) => {
    const r = await call('GET', '/tasks?sort=x&team=Z', { headers: ADMIN });
    assert.equal(r.status, 400);
    assert.deepEqual([r.json.error.code, r.json.error.field], ['INVALID_QUERY', 'sort']);
    assert.equal((await call('GET', '/tasks?dueBefore=2026-02-30', { headers: ADMIN })).json.error.field, 'dueBefore');
    assert.equal((await call('GET', '/tasks?page=1&page=2', { headers: ADMIN })).status, 400);
    assert.equal((await call('GET', '/tasks?pageSize=101', { headers: ADMIN })).status, 400);
  }));

test('member: tự lọc theo nhóm; team khác → rỗng', () =>
  withApp(async (call) => {
    const u4 = as('u4');
    const r = await call('GET', '/tasks', { headers: u4 });
    assert.equal(r.json.total, 5);
    assert.ok(r.json.items.every((t) => t.team === 'B'));
    const o = await call('GET', '/tasks?team=A', { headers: u4 });
    assert.equal(o.status, 200);
    assert.deepEqual([o.json.items, o.json.total], [[], 0]);
    const csv = await call('GET', '/tasks/export.csv?team=A', { headers: u4 });
    assert.equal(csv.status, 200);
    assert.equal(csv.text, '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n');
    // manager thấy mọi nhóm
    assert.equal((await call('GET', '/tasks', { headers: as('u2') })).json.total, 12);
  }));

test('GET /tasks/export.csv', () =>
  withApp(async (call) => {
    const r = await call('GET', '/tasks/export.csv?sort=-createdAt&q=excel', { headers: ADMIN });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(r.text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.includes(`t7,"'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,`));
    assert.ok(r.text.endsWith('\r\n'));
    const all = await call('GET', '/tasks/export.csv', { headers: ADMIN });
    assert.equal(all.text.split('\r\n').length, 1 + 12 + 1 /* tiêu đề + 12 dòng + phần rỗng cuối; \n trong ô t8 không phải CRLF */);
    assert.ok(all.text.includes(`,'-Ghi chú nội bộ,`));
    for (const q of ['page=1', 'pageSize=5', 'foo=1', 'sort=x']) {
      const e = await call('GET', '/tasks/export.csv?' + q, { headers: ADMIN });
      assert.equal(e.status, 400);
      assert.equal(e.json.error.code, 'INVALID_QUERY');
    }
  }));
