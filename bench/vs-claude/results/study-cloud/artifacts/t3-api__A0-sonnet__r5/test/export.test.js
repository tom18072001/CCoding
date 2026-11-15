'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');
const { cell } = require('../src/csv');

const as = (u) => ({ headers: { 'x-user': u } });

async function csv(app, qs, u) {
  const res = await fetch(app.base + '/tasks/export.csv' + qs, { headers: { 'x-user': u } });
  return { res, text: Buffer.from(await res.arrayBuffer()).toString('utf8') };
}

test('CSV: header, BOM, CRLF, RFC 4180, chống công thức', async () => {
  const app = await start();
  try {
    const { res, text } = await csv(app, '?sort=createdAt&team=A', 'u1');
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(text.endsWith('\r\n'));
    assert.ok(text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,2026-10-03T08:00:00.000Z\r\n'));
    assert.ok(text.includes(`t7,"'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,`));
    assert.ok(text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done'));
    assert.ok(text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15"));
  } finally {
    await app.close();
  }
});

test('CSV: quyền, bộ lọc, không phân trang', async () => {
  const app = await start();
  try {
    const m = await csv(app, '', 'u4');
    assert.equal(m.text.split('\r\n').length, 1 + 5 + 1); // tiêu đề + 5 nhiệm vụ nhóm B + rỗng cuối
    assert.equal((await csv(app, '?status=done', 'u1')).text.split('\r\n').length, 1 + 3 + 1);
    for (const p of ['?page=1', '?pageSize=5']) {
      const r = await app.call('GET', '/tasks/export.csv' + p, as('u1'));
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
    }
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
  } finally {
    await app.close();
  }
});

test('cell()', () => {
  assert.equal(cell('\tx'), "'\tx");
  assert.equal(cell('\rx'), '"\'\rx"');
  assert.equal(cell('+1'), "'+1");
  assert.equal(cell('@a'), "'@a");
  assert.equal(cell(3), '3');
  assert.equal(cell(null), '');
  assert.equal(cell('a"b'), '"a""b"');
});
