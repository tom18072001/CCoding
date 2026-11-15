'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');
const { toCsv } = require('../src/csv');

const H = { 'x-user': 'u1' };
const BOM = '﻿';
const HEADER = 'id,title,status,priority,assignee,team,dueDate,createdAt\r\n';

test('toCsv: BOM, CRLF, quoting, chống công thức', () => {
  const t = (title, extra = {}) => ({ id: 't1', title, status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: 'c', ...extra });
  const out = toCsv([t('a,b'), t('say "hi"'), t('l1\nl2'), t('=SUM(A1)'), t('-x'), t('@a'), t('+1'), t('\tx'), t('\rx'), t('=a,b', { priority: -1 })]);
  assert.ok(out.startsWith(BOM + HEADER));
  assert.ok(out.endsWith('\r\n'));
  const lines = out.slice(1).split('\r\n');
  assert.equal(lines[1], 't1,"a,b",todo,1,,A,,c');
  assert.equal(lines[2], 't1,"say ""hi""",todo,1,,A,,c');
  assert.ok(out.includes('"l1\nl2"'));
  assert.ok(out.includes("t1,'=SUM(A1),todo"));
  assert.ok(out.includes("t1,'-x,todo"));
  assert.ok(out.includes("t1,'@a,todo"));
  assert.ok(out.includes("t1,'+1,todo"));
  assert.ok(out.includes("t1,'\tx,todo"));
  assert.ok(out.includes('t1,"\'\rx",todo'));
  assert.ok(out.includes('t1,"\'=a,b",todo,-1,'), 'số âm giữ nguyên');
});

test('GET /tasks/export.csv', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv', { headers: H });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', { headers: H })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(raw.toString('utf8').startsWith(BOM + HEADER));
    assert.equal(r.text.split('\r\n').length, 14); // tiêu đề + 12 dòng + phần rỗng cuối
    const member = await app.call('GET', '/tasks/export.csv', { headers: { 'x-user': 'u3' } });
    assert.ok(!member.text.includes(',B,'));
    const filtered = await app.call('GET', '/tasks/export.csv?status=nope', { headers: H });
    assert.equal(filtered.json.error.field, 'status');
    for (const p of ['page=1', 'pageSize=5']) {
      const bad = await app.call('GET', `/tasks/export.csv?${p}`, { headers: H });
      assert.equal(bad.status, 400);
      assert.equal(bad.json.error.code, 'INVALID_QUERY');
    }
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
  } finally {
    await app.close();
  }
});
