'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('export.csv: header, BOM, CRLF, escape, chống công thức', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv?status=todo&sort=-priority');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', { headers: { 'x-user': 'u1' } })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // fetch.text() tự bỏ BOM
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes(`t7,"'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,`));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
  } finally {
    await app.close();
  }
});

test('export.csv: member tự lọc nhóm; page/pageSize → 400; 401', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv', { user: 'u4' });
    const ids = r.text.split('\r\n').slice(1, -1).map((l) => l.split(',')[0]);
    assert.deepEqual(ids, ['t4', 't5', 't6', 't10', 't12']);
    for (const qs of ['page=1', 'pageSize=5']) {
      const e = await app.call('GET', '/tasks/export.csv?' + qs);
      assert.equal(e.status, 400);
      assert.equal(e.json.error.code, 'INVALID_QUERY');
    }
    assert.equal((await app.call('GET', '/tasks/export.csv', { user: null })).status, 401);
  } finally {
    await app.close();
  }
});
