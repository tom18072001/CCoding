'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, U } = require('./helpers2');

test('xuất CSV', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv?team=A&sort=-id'.replace('-id', 'createdAt'), { headers: U('u1') });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', { headers: U('u1') })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM (fetch.text() tự bỏ BOM)
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,2026-10-03T08:00:00.000Z\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,'));
    assert.ok(r.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,"));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', { headers: U('u1') })).json.error.field, 'page');
    const m = await app.call('GET', '/tasks/export.csv', { headers: U('u4') });
    assert.ok(!m.text.includes(',A,'));
    assert.equal(m.text.split('\r\n').length, 7); // header + 5 + rỗng cuối
  } finally {
    await app.close();
  }
});
