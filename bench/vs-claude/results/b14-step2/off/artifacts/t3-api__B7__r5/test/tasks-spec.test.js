'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });
const ids = (r) => r.json.items.map((t) => t.id);

async function withServer(fn) {
  const s = await start();
  try {
    await fn(s);
  } finally {
    await s.close();
  }
}

test('thứ tự kiểm tra: 401 → 400 query → 404 → 403', () =>
  withServer(async ({ call }) => {
    assert.equal((await call('GET', '/tasks?bad=1')).status, 401);
    assert.equal((await call('GET', '/tasks', as('nope'))).status, 401);
    assert.equal((await call('GET', '/tasks?bad=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await call('GET', '/tasks/t999', as('u1'))).status, 404);
    const b = (await call('GET', '/tasks?team=B&pageSize=100', as('u1'))).json.items[0].id;
    for (const m of ['GET', 'PATCH', 'DELETE']) assert.equal((await call(m, `/tasks/${b}`, as('u3'))).status, 404, m);
  }));

test('member PATCH: 403 trước INVALID_JSON khi không được giao; khóa khác status → 403', () =>
  withServer(async ({ call, base }) => {
    const raw = (u, path, method) =>
      fetch(base + path, { method, headers: { 'x-user': u }, body: '{bad' }).then(async (r) => ({ status: r.status, json: await r.json() }));
    assert.equal((await raw('u3', '/tasks', 'POST')).status, 403);
    const mine = (await call('GET', '/tasks?assignee=u3', as('u1'))).json.items[0].id;
    const notMine = (await call('GET', '/tasks?assignee=none&team=A', as('u1'))).json.items[0].id;
    assert.equal((await raw('u3', `/tasks/${notMine}`, 'PATCH')).status, 403);
    assert.equal((await raw('u3', `/tasks/${mine}`, 'PATCH')).json.error.code, 'INVALID_JSON');
    const cur = (await call('GET', `/tasks/${mine}`, as('u3'))).json;
    assert.equal((await call('PATCH', `/tasks/${mine}`, withBody('u3', { status: cur.status, title: cur.title }))).status, 403);
    assert.equal((await call('PATCH', `/tasks/${mine}`, withBody('u3', { status: 'bogus', title: 'x' }))).status, 403);
    assert.equal((await call('PATCH', `/tasks/${mine}`, withBody('u3', { status: 'bogus' }))).json.error.code, 'VALIDATION');
    assert.equal((await call('PATCH', `/tasks/${mine}`, withBody('u3', { status: 'done' }))).status, 200);
    assert.equal((await call('DELETE', `/tasks/${mine}`, as('u3'))).status, 403);
  }));

test('manager: team khác → 403, xóa → 403, PATCH nhóm khác → 403', () =>
  withServer(async ({ call }) => {
    assert.equal((await call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await call('POST', '/tasks', withBody('u2', { title: 'x', team: 'Z' }))).status, 403);
    assert.equal((await call('POST', '/tasks', withBody('u2', { title: 'x' }))).status, 400);
    assert.equal((await call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    const b = (await call('GET', '/tasks?team=B', as('u2'))).json.items[0].id;
    assert.equal((await call('GET', `/tasks/${b}`, as('u2'))).status, 200);
    assert.equal((await call('PATCH', `/tasks/${b}`, withBody('u2', { title: 'y' }))).status, 403);
    const a = (await call('GET', '/tasks?team=A', as('u2'))).json.items[0].id;
    assert.equal((await call('PATCH', `/tasks/${a}`, withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await call('DELETE', `/tasks/${a}`, as('u2'))).status, 403);
  }));

test('parseQuery: lỗi theo thứ tự URL, tham số lạ/lặp, giá trị sai', () =>
  withServer(async ({ call }) => {
    const bad = async (qs, field) => {
      const r = await call('GET', '/tasks?' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    };
    await bad('page=0&status=zzz', 'page');
    await bad('status=zzz&page=0', 'status');
    await bad('team=C', 'team');
    await bad('sort=id', 'sort');
    await bad('dueBefore=2026-02-30', 'dueBefore');
    await bad('dueBefore=2026-2-3', 'dueBefore');
    await bad('page=1.5', 'page');
    await bad('page=abc', 'page');
    await bad('pageSize=101', 'pageSize');
    await bad('pageSize=0', 'pageSize');
    await bad('foo=1', 'foo');
    await bad('status=todo&status=done', 'status');
    await bad('status=todo,', 'status');
    assert.equal((await call('GET', '/tasks?q=', as('u1'))).json.total, (await call('GET', '/tasks', as('u1'))).json.total);
  }));

test('lọc: q không dấu, assignee=none, dueBefore, member bị ép nhóm', () =>
  withServer(async ({ call }) => {
    assert.deepEqual(ids(await call('GET', '/tasks?q=DAO%20TAO', as('u1'))), ['t10']);
    assert.deepEqual(ids(await call('GET', '/tasks?q=' + encodeURIComponent('đào tạo'.normalize('NFD')), as('u1'))), ['t10']);
    assert.ok(ids(await call('GET', '/tasks?q=' + encodeURIComponent('THIẾT KẾ'), as('u1'))).includes('t1'));
    const none = await call('GET', '/tasks?assignee=none&pageSize=100', as('u1'));
    assert.ok(none.json.items.length > 0 && none.json.items.every((t) => t.assignee === null));
    const due = await call('GET', '/tasks?dueBefore=2026-11-08&pageSize=100', as('u1'));
    assert.ok(due.json.items.length > 0 && due.json.items.every((t) => t.dueDate && t.dueDate <= '2026-11-08'));
    assert.ok(!ids(due).includes('t3') && !ids(due).includes('t10'));
    const m = await call('GET', '/tasks?team=B', as('u3'));
    assert.deepEqual(m.json, { items: [], total: 0, page: 1, pageSize: 20 });
    const all = await call('GET', '/tasks?pageSize=100', as('u3'));
    assert.ok(all.json.items.every((t) => t.team === 'A'));
    const st = await call('GET', '/tasks?status=todo,doing&pageSize=100', as('u1'));
    assert.ok(st.json.items.every((t) => t.status !== 'done'));
  }));

test('sắp xếp: hòa theo số id, dueDate null ở cuối, title vi, phân trang', () =>
  withServer(async ({ call }) => {
    const num = (id) => Number(id.slice(1));
    for (const sort of ['priority', '-priority']) {
      const items = (await call('GET', `/tasks?sort=${sort}&pageSize=100`, as('u1'))).json.items;
      for (let i = 1; i < items.length; i++) {
        if (items[i - 1].priority === items[i].priority) assert.ok(num(items[i - 1].id) < num(items[i].id), sort);
      }
    }
    for (const sort of ['dueDate', '-dueDate']) {
      const items = (await call('GET', `/tasks?sort=${sort}&pageSize=100`, as('u1'))).json.items;
      const firstNull = items.findIndex((t) => t.dueDate === null);
      assert.ok(firstNull > 0);
      assert.ok(items.slice(firstNull).every((t) => t.dueDate === null), sort);
      const withDue = items.slice(0, firstNull).map((t) => t.dueDate);
      const expected = [...withDue].sort();
      if (sort[0] === '-') expected.reverse();
      assert.deepEqual(withDue, expected);
    }
    const t = (await call('GET', '/tasks?sort=title&pageSize=100', as('u1'))).json.items.map((x) => x.title);
    assert.deepEqual(t, [...t].sort((a, b) => a.localeCompare(b, 'vi')));
    const p = await call('GET', '/tasks?pageSize=3&page=2', as('u1'));
    const full = (await call('GET', '/tasks?pageSize=100', as('u1'))).json;
    assert.deepEqual(ids(p), full.items.slice(3, 6).map((x) => x.id));
    assert.equal(p.json.page, 2);
    const over = await call('GET', '/tasks?page=99', as('u1'));
    assert.equal(over.status, 200);
    assert.deepEqual(over.json.items, []);
    assert.equal(over.json.total, full.total);
  }));

test('CSV: header, BOM, CRLF, RFC 4180, tham số phân trang bị cấm, quyền member', () =>
  withServer(async ({ call, base }) => {
    assert.equal((await call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
    assert.equal((await call('GET', '/tasks/export.csv?pageSize=5', as('u1'))).status, 400);
    assert.equal((await call('GET', '/tasks/export.csv')).status, 401);
    const res = await fetch(base + '/tasks/export.csv', as('u1'));
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const text = buf.toString('utf8').slice(1);
    assert.ok(text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(text.endsWith('\r\n'));
    assert.ok(text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",'));
    assert.ok(text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",'));
    assert.match(text.split('\r\n').find((l) => l.startsWith('t3,')), /,[AB],,2026-/);
    assert.match(text, /t1,[^\r]*,1,u3,A,2026-11-05,/);
    const m = await (await fetch(base + '/tasks/export.csv?sort=-priority', as('u3'))).text();
    assert.ok(!m.split('\r\n').some((l) => /,B,/.test(l)));
  }));

test('CSV: ký tự đầu nguy hiểm được thêm dấu nháy', () =>
  withServer(async ({ call, base }) => {
    for (const title of ['+1', '-2', '@x', '\tTab', '\rCR']) {
      assert.equal((await call('POST', '/tasks', withBody('u1', { title, team: 'A' }))).status, 201);
    }
    const text = await (await fetch(base + '/tasks/export.csv?sort=-createdAt', as('u1'))).text();
    assert.ok(text.includes(",'+1,"));
    assert.ok(text.includes(",'-2,"));
    assert.ok(text.includes(",'@x,"));
    assert.ok(text.includes(",'\tTab,"));
    assert.ok(text.includes(',"\'\rCR",'));
  }));
