'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');
const { toCsv, cell } = require('../src/csv');

test('cell: quoting, chống công thức, null, số', () => {
  assert.equal(cell(null), '');
  assert.equal(cell(3), '3');
  assert.equal(cell('a,b'), '"a,b"');
  assert.equal(cell('say "hi"'), '"say ""hi"""');
  assert.equal(cell('x\ny'), '"x\ny"');
  for (const c of ['=', '+', '-', '@', '\t', '\r']) {
    assert.ok(cell(c + 'x').startsWith("'" + c) || cell(c + 'x').startsWith('"\'' + c), c);
  }
  assert.equal(cell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(cell('=1,2'), '"\'=1,2"');
  assert.equal(cell('a=b'), 'a=b');
});

test('toCsv: BOM, header, CRLF cuối', () => {
  const out = toCsv([{ id: 't1', title: 'A', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: 'z' }]);
  assert.equal(out, '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\nt1,A,todo,1,,A,,z\r\n');
});

test('HTTP export.csv: header, nội dung, escape, công thức', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv', { headers: { 'x-user': 'u1' } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', { headers: { 'x-user': 'u1' } })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(r.text.endsWith('\r\n'));
    const t = r.text.replace(/^﻿/, '');
    assert.ok(t.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(t.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(t.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.ok(t.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.ok(t.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
  } finally {
    await app.close();
  }
});

test('HTTP export.csv: dùng bộ lọc, member bị lọc nhóm, page/pageSize → 400', async () => {
  const app = await start();
  try {
    const h = (u) => ({ headers: { 'x-user': u } });
    const f = await app.call('GET', '/tasks/export.csv?status=done&sort=-priority', h('u1'));
    assert.equal(f.text.split('\r\n').length, 5); // header + 3 dòng + rỗng cuối
    const m = await app.call('GET', '/tasks/export.csv', h('u4'));
    assert.ok(!m.text.includes(',A,') && m.text.includes(',B,'));
    for (const k of ['page=1', 'pageSize=5']) {
      const e = await app.call('GET', '/tasks/export.csv?' + k, h('u1'));
      assert.equal(e.status, 400);
      assert.equal(e.json.error.code, 'INVALID_QUERY');
      assert.equal(e.json.error.field, k.split('=')[0]);
    }
    assert.equal((await app.call('GET', '/tasks/export.csv', { user: null })).status, 401);
  } finally {
    await app.close();
  }
});
