'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');
const { toCsv } = require('../src/csv');

const as = (id) => ({ 'x-user': id });
const ADMIN = as('u1'), MGR_A = as('u2'), MEM_A1 = as('u3');

async function raw(app, path, headers) {
  const res = await fetch(app.base + path, { headers });
  return { res, buf: Buffer.from(await res.arrayBuffer()) };
}

const dataRows = (buf) => buf.toString('utf8').slice(1).split('\r\n').slice(1, -1);

async function withApp(fn) {
  const app = await start();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('csv: header HTTP, BOM thô, CRLF, tiêu đề cột', () =>
  withApp(async (a) => {
    const { res, buf } = await raw(a, '/tasks/export.csv', ADMIN);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const text = buf.toString('utf8').slice(1);
    assert.ok(text.endsWith('\r\n'));
    // \n trần chỉ được phép nằm trong ô được bọc ngoặc kép (seed t8); ngoài ô mọi \n đi kèm \r
    const outsideQuotes = text.replace(/"(?:[^"]|"")*"/g, '""');
    assert.ok(!/[^\r]\n/.test(outsideQuotes), 'mọi \\n ngoài ô bọc phải đi kèm \\r');
    const lines = text.split('\r\n');
    assert.equal(lines[0], 'id,title,status,priority,assignee,team,dueDate,createdAt');
    const total = (await a.call('GET', '/tasks?pageSize=100', { headers: ADMIN })).json.total;
    assert.equal(lines.length, total + 2); // tiêu đề + dữ liệu + phần rỗng sau \r\n cuối
  }));

test('csv: escape RFC 4180 và chống công thức qua HTTP', () =>
  withApp(async (a) => {
    const titles = ['a,b', 'say "hi"', '=SUM(A1)', '+1', '-2', '@x', 'x\ny', '\tTab'];
    for (const title of titles) {
      const r = await a.call('POST', '/tasks', { headers: ADMIN, body: { title, team: 'A' } });
      assert.equal(r.status, 201, title);
    }
    const { buf } = await raw(a, '/tasks/export.csv', ADMIN);
    const text = buf.toString('utf8');
    assert.ok(text.includes(',"a,b",'));
    assert.ok(text.includes(',"say ""hi""",'));
    assert.ok(text.includes(",'=SUM(A1),"));
    assert.ok(text.includes(",'+1,"));
    assert.ok(text.includes(",'-2,"));
    assert.ok(text.includes(",'@x,"));
    assert.ok(text.includes(',"x\ny",'));
    assert.ok(text.includes(",'\tTab,"));
  }));

test('csv: toCsv — null trống, số giữ nguyên, \\r đầu được thêm nháy và bọc', () => {
  const out = toCsv([{ id: 't1', title: '\rx', status: 'todo', priority: -1, assignee: null, team: 'A', dueDate: null, createdAt: 'c' }]);
  assert.equal(out, '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\nt1,"\'\rx",todo,-1,,A,,c\r\n');
});

test('csv: dùng bộ lọc/sắp xếp như danh sách, cấm phân trang', () =>
  withApp(async (a) => {
    const q = 'status=todo,doing&sort=-priority';
    const list = (await a.call('GET', `/tasks?${q}&pageSize=100`, { headers: ADMIN })).json.items;
    const { buf } = await raw(a, `/tasks/export.csv?${q}`, ADMIN);
    const rows = dataRows(buf);
    assert.equal(rows.length, list.length);
    assert.deepEqual(rows.map((r) => r.split(',')[0]), list.map((t) => t.id));
    for (const p of ['page=1', 'pageSize=5']) {
      const r = await a.call('GET', `/tasks/export.csv?${p}`, { headers: ADMIN });
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, p.split('=')[0]);
    }
    assert.equal((await a.call('GET', '/tasks/export.csv?zzz=1', { headers: ADMIN })).status, 400);
  }));

test('csv: phân quyền — 401, member chỉ thấy nhóm mình, manager thấy tất cả', () =>
  withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks/export.csv')).status, 401);
    assert.equal((await a.call('GET', '/tasks/export.csv?zzz=1')).status, 401);
    const teams = async (h, qs = '') => dataRows((await raw(a, '/tasks/export.csv' + qs, h)).buf).map((r) => r.split(',').slice(-3)[0]);
    const mem = await teams(MEM_A1);
    assert.ok(mem.length > 0 && mem.every((t) => t === 'A'), mem.join('|'));
    assert.deepEqual(await teams(MEM_A1, '?team=B'), []);
    const all = (await a.call('GET', '/tasks', { headers: MGR_A })).json.total;
    assert.equal((await teams(MGR_A)).length, all);
  }));
