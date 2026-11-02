'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });
const ADMIN = as('u1');
const BOM = '﻿';
const CRLF = '\r\n';
const HEADER = 'id,title,status,priority,assignee,team,dueDate,createdAt';
const TAIL = ',todo,2,,A,,2026-01-01T00:00:00.000Z';
const mk = (id, title, team = 'A', extra = {}) => ({
  id, title, status: 'todo', priority: 2, assignee: null, team, dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...extra,
});
const users = [
  { id: 'u1', name: 'Admin', role: 'admin', team: null },
  { id: 'u2', name: 'Mgr A', role: 'manager', team: 'A' },
  { id: 'u3', name: 'Mem A', role: 'member', team: 'A' },
  { id: 'u4', name: 'Mem B', role: 'member', team: 'B' },
];
async function withApp(tasks, fn) {
  const app = await start({ seed: { users, tasks }, now: () => new Date('2026-05-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
// fetch().text() tự bỏ BOM, nên đọc byte thô và giải mã giữ nguyên BOM.
const csv = async (app, qs = '', h = ADMIN) => {
  const res = await fetch(`${app.base}/tasks/export.csv${qs}`, { headers: h });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString('utf8');
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, headers: res.headers, text, json, buf };
};
const body = (r) => r.text.slice(BOM.length + HEADER.length + CRLF.length);
const idsOf = (r) => r.text.split(CRLF).slice(1, -1).map((l) => l.split(',')[0]);

test('header HTTP, BOM, tiêu đề, CRLF cuối', async () => {
  await withApp([mk('t1', 'Một', 'A', { assignee: 'u3', dueDate: '2026-03-01', priority: 3, status: 'doing' })], async (app) => {
    const r = await csv(app);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.deepEqual([...r.buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(r.text, `${BOM}${HEADER}${CRLF}t1,Một,doing,3,u3,A,2026-03-01,2026-01-01T00:00:00.000Z${CRLF}`);
  });
});

test('không có nhiệm vụ → chỉ BOM + tiêu đề + CRLF', async () => {
  await withApp([], async (app) => {
    assert.equal((await csv(app)).text, `${BOM}${HEADER}${CRLF}`);
  });
});

test('null → ô trống; số giữ nguyên', async () => {
  await withApp([mk('t1', 'x', 'B', { priority: 1 })], async (app) => {
    assert.equal((await csv(app)).text, `${BOM}${HEADER}${CRLF}t1,x,todo,1,,B,,2026-01-01T00:00:00.000Z${CRLF}`);
  });
});

test('quoting RFC 4180: dấu phẩy, ", LF, CR và nhân đôi dấu "', async () => {
  const tasks = [mk('t1', 'a,b'), mk('t2', 'nói "chào"'), mk('t3', 'dòng1\ndòng2'), mk('t4', 'x\ry'), mk('t5', 'thường')];
  await withApp(tasks, async (app) => {
    const cells = ['"a,b"', '"nói ""chào"""', '"dòng1\ndòng2"', '"x\ry"', 'thường'];
    assert.equal(body(await csv(app)), cells.map((c, i) => `t${i + 1},${c}${TAIL}${CRLF}`).join(''));
  });
});

test('chống chèn công thức: = + - @ tab CR thêm dấu nháy đơn ở đầu', async () => {
  const titles = ['=1+1', '+1', '-2', '@SUM', '\tTab', '\rCR', '=a,b', 'a=b', '=HYPERLINK("x")'];
  const cells = ["'=1+1", "'+1", "'-2", "'@SUM", "'\tTab", '"\'\rCR"', '"\'=a,b"', 'a=b', '"\'=HYPERLINK(""x"")"'];
  await withApp(titles.map((t, i) => mk(`t${i + 1}`, t)), async (app) => {
    const exp = cells.map((c, i) => `t${i + 1},${c}${TAIL}${CRLF}`).join('');
    assert.equal(body(await csv(app)), exp);
  });
});

test('dùng chung lọc/sắp xếp như danh sách', async () => {
  const tasks = [mk('t1', 'Bài A', 'A', { status: 'done' }), mk('t2', 'Bài B', 'B'), mk('t3', 'Khác', 'A')];
  await withApp(tasks, async (app) => {
    assert.deepEqual(idsOf(await csv(app, '?q=bai&sort=-title')), ['t2', 't1']);
    assert.deepEqual(idsOf(await csv(app, '?status=todo&team=A')), ['t3']);
  });
});

test('không phân trang: page/pageSize → 400; tham số lạ/giá trị sai → 400', async () => {
  await withApp([mk('t1', 'x')], async (app) => {
    for (const [qs, field] of [['?page=1', 'page'], ['?pageSize=10', 'pageSize'], ['?status=x', 'status'], ['?foo=1', 'foo']]) {
      const r = await csv(app, qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field);
    }
  });
});

test('401 không X-User; member chỉ xuất nhóm mình; manager thấy tất cả', async () => {
  const tasks = [mk('t1', 'A1', 'A'), mk('t2', 'B1', 'B'), mk('t3', 'A2', 'A')];
  await withApp(tasks, async (app) => {
    const r = await app.call('GET', '/tasks/export.csv');
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    assert.deepEqual(idsOf(await csv(app, '', as('u3'))), ['t1', 't3']);
    assert.deepEqual(idsOf(await csv(app, '?team=B', as('u3'))), []);
    assert.deepEqual(idsOf(await csv(app, '', as('u4'))), ['t2']);
    assert.deepEqual(idsOf(await csv(app, '', as('u2'))), ['t1', 't2', 't3']);
  });
});
