'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');
const { toCsv } = require('../src/csv');

test('CSV: header, BOM, CRLF, escape, chống công thức', async () => {
  const csv = toCsv([
    { id: 't1', title: 'a,"b"', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: 'x' },
    { id: 't2', title: '=1+1', status: 'todo', priority: 2, assignee: '-u', team: 'A', dueDate: null, createdAt: 'x' },
    { id: 't3', title: 'l1\nl2', status: 'todo', priority: 3, assignee: null, team: 'A', dueDate: null, createdAt: 'x' },
    { id: 't4', title: '\t@x', status: 'todo', priority: 3, assignee: null, team: 'A', dueDate: null, createdAt: 'x' },
  ]);
  assert.equal(
    csv,
    '\uFEFFid,title,status,priority,assignee,team,dueDate,createdAt\r\n' +
      't1,"a,""b""",todo,1,,A,,x\r\n' +
      "t2,'=1+1,todo,2,'-u,A,,x\r\n" +
      't3,"l1\nl2",todo,3,,A,,x\r\n' +
      "t4,'\t@x,todo,3,,A,,x\r\n",
  );
});

test('GET /tasks/export.csv', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv?sort=-title', { headers: { 'x-user': 'u3' } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', { headers: { 'x-user': 'u3' } })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // fetch.text() tự bỏ BOM
    assert.ok(r.text.endsWith('\r\n'));
    const rows = r.text.trim().split('\r\n');
    assert.ok(rows.length > 1 && rows.slice(1).every((l) => l.includes(',A,')));
    const bad = await app.call('GET', '/tasks/export.csv?page=1', { headers: { 'x-user': 'u1' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.field, 'page');
  } finally {
    await app.close();
  }
});
