'use strict';
// Bộ test HTTP độc lập, viết từ FEATURES.md (không dựa vào cách hiện thực).
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const CLOCK = () => new Date('2026-11-01T00:00:00Z');
const as = (u, extra = {}) => ({ headers: { 'x-user': u }, ...extra });
// u1 admin · u2 manager A · u3 member A (được giao t1,t2,t8,t9) · u4 member B · u5 manager B · u6 member A

async function withApp(fn) {
  const app = await start({ now: CLOCK });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);
const list = async (a, qs, user = 'u1') => a.call('GET', `/tasks${qs}`, as(user));

test('401: header X-User thiếu / sai / rỗng, trước mọi kiểm tra khác', () =>
  withApp(async (a) => {
    const reqs = [
      ['GET', '/tasks'], ['GET', '/tasks?bogus=1'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'],
      ['GET', '/audit'], ['GET', '/audit?x=1'], ['POST', '/tasks', { title: 'x', team: 'A' }],
      ['PATCH', '/tasks/t1', { status: 'done' }], ['PATCH', '/tasks/t999', {}], ['DELETE', '/tasks/t1'], ['DELETE', '/tasks/t999'],
    ];
    for (const [m, p, body] of reqs) {
      const r = await a.call(m, p, body ? { body } : {});
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    for (const u of ['zzz', 'U1', '']) {
      const r = await a.call('GET', '/tasks', as(u));
      assert.equal(r.status, 401, `X-User=${JSON.stringify(u)}`);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await a.call('GET', '/tasks', as('u1'))).status, 200);
  }));

test('thứ tự mã lỗi: 401 → 400 query → 404 → 403 → 400 body', () =>
  withApp(async (a) => {
    // query 400 đứng trước 403 của /audit
    let r = await a.call('GET', '/audit?bogus=1', as('u2'));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal((await a.call('GET', '/audit', as('u2'))).status, 403);
    // 404 trước 403 và 400 body (member nhóm khác)
    assert.equal((await a.call('PATCH', '/tasks/t4', as('u3', { body: { title: '' } }))).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await a.call('PATCH', '/tasks/t999', as('u3', { body: { status: 'done' } }))).status, 404);
    // 403 trước 400 body
    assert.equal((await a.call('PATCH', '/tasks/t4', as('u2', { body: { title: '' } }))).status, 403); // manager, nhóm khác
    assert.equal((await a.call('PATCH', '/tasks/t3', as('u3', { body: { status: 'bad' } }))).status, 403); // không giao cho mình
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u3', { body: { title: '' } }))).status, 403); // member sửa trường khác
    assert.equal((await a.call('POST', '/tasks', as('u3', { body: {} }))).status, 403); // member tạo
    assert.equal((await a.call('POST', '/tasks', as('u2', { body: { title: '', team: 'B' } }))).status, 403); // manager nhóm khác
    // cuối cùng mới tới 400 body
    r = await a.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'bad' } }));
    assert.equal(r.status, 400);
    r = await a.call('POST', '/tasks', as('u1', { body: { title: 'x' } }));
    assert.equal(r.status, 400);
    r = await a.call('PATCH', '/tasks/t1', as('u1', { body: { priority: 9 } }));
    assert.equal(r.status, 400);
  }));

test('quyền admin: làm mọi việc', () =>
  withApp(async (a) => {
    const c = await a.call('POST', '/tasks', as('u1', { body: { title: 'Việc B', team: 'B' } }));
    assert.equal(c.status, 201);
    assert.equal(c.json.team, 'B');
    const id = c.json.id;
    assert.equal((await a.call('PATCH', `/tasks/${id}`, as('u1', { body: { team: 'A', assignee: 'u3' } }))).status, 200);
    assert.equal((await a.call('GET', '/tasks/t4', as('u1'))).status, 200);
    assert.equal((await a.call('DELETE', `/tasks/${id}`, as('u1'))).status, 204);
    assert.equal((await a.call('GET', `/tasks/${id}`, as('u1'))).status, 404);
  }));

test('quyền manager', () =>
  withApp(async (a) => {
    assert.equal((await list(a, '', 'u2')).json.total, 12); // đọc mọi nhóm
    assert.equal((await a.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await a.call('POST', '/tasks', as('u2', { body: { title: 'x', team: 'B' } }))).status, 403);
    assert.equal((await a.call('POST', '/tasks', as('u2', { body: { title: 'x', team: 'A' } }))).status, 201);
    assert.equal((await a.call('PATCH', '/tasks/t4', as('u2', { body: { title: 'y' } }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u2', { body: { team: 'B' } }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u2', { body: { title: 'y', priority: 3, assignee: 'u6' } }))).status, 200);
    assert.equal((await a.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t4', as('u2'))).status, 403);
    // manager nhóm B
    assert.equal((await a.call('PATCH', '/tasks/t4', as('u5', { body: { title: 'ok' } }))).status, 200);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u5', { body: { title: 'no' } }))).status, 403);
  }));

test('quyền member', () =>
  withApp(async (a) => {
    assert.equal((await list(a, '', 'u3')).json.total, 7);
    assert.deepEqual(new Set((await list(a, '', 'u3')).json.items.map((t) => t.team)), new Set(['A']));
    assert.equal((await list(a, '', 'u4')).json.total, 5);
    assert.equal((await list(a, '?team=B', 'u3')).status, 200);
    assert.equal((await list(a, '?team=B', 'u3')).json.total, 0);
    assert.deepEqual((await list(a, '?team=B', 'u3')).json.items, []);
    assert.equal((await a.call('GET', '/tasks/t1', as('u3'))).status, 200);
    assert.equal((await a.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await a.call('PATCH', '/tasks/t4', as('u3', { body: { status: 'done' } }))).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await a.call('POST', '/tasks', as('u3', { body: { title: 'x', team: 'A' } }))).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t3', as('u3', { body: { status: 'done' } }))).status, 403); // giao cho u6
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'done', title: 'x' } }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'done', priority: 1 } }))).status, 403); // kể cả trùng giá trị cũ
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u3', { body: { assignee: 'u3' } }))).status, 403);
    const ok = await a.call('PATCH', '/tasks/t2', as('u3', { body: { status: 'done' } }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
  }));

test('lọc: status, assignee, team, dueBefore', () =>
  withApp(async (a) => {
    assert.equal((await list(a, '?status=todo')).json.total, 6);
    assert.equal((await list(a, '?status=todo,doing')).json.total, 9);
    assert.equal((await list(a, '?status=done')).json.total, 3);
    assert.deepEqual(ids(await list(a, '?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await list(a, '?assignee=u6')), ['t3', 't7']);
    assert.deepEqual(ids(await list(a, '?team=B')), ['t4', 't5', 't6', 't10', 't12']);
    assert.deepEqual(ids(await list(a, '?dueBefore=2026-11-05')), ['t1', 't8', 't9', 't12']); // bao gồm ngày biên, loại dueDate null
    assert.equal((await list(a, '?dueBefore=2026-12-31')).json.total, 10);
    assert.deepEqual(ids(await list(a, '?status=todo&team=A&assignee=none')), ['t11']);
    const r = await list(a, '?status=done&pageSize=2');
    assert.equal(r.json.total, 3);
    assert.equal(r.json.items.length, 2);
    assert.equal(r.json.page, 1);
    assert.equal(r.json.pageSize, 2);
  }));

test('tìm kiếm q: không phân biệt hoa/thường và dấu, đ→d', () =>
  withApp(async (a) => {
    assert.deepEqual(ids(await list(a, '?q=' + encodeURIComponent('đặc tả'))), ['t4', 't12']);
    assert.deepEqual(ids(await list(a, '?q=dac%20ta')), ['t4', 't12']);
    assert.deepEqual(ids(await list(a, '?q=' + encodeURIComponent('ĐẶC TẢ'))), ['t4', 't12']);
    assert.deepEqual(ids(await list(a, '?q=DAO%20TAO')), ['t10']);
    assert.deepEqual(ids(await list(a, '?q=' + encodeURIComponent('Đào'))), ['t10']);
    assert.deepEqual(ids(await list(a, '?q=sum(a1')), ['t7']);
    assert.equal((await list(a, '?q=')).json.total, 12); // q rỗng = không lọc
    assert.equal((await list(a, '?q=khongcogi')).json.total, 0);
    assert.deepEqual(ids(await list(a, '?q=dac%20ta&team=B&status=done')), ['t12']);
  }));

test('sắp xếp: mặc định, priority, dueDate (null cuối), title tiếng Việt, hòa theo số của id', () =>
  withApp(async (a) => {
    assert.deepEqual(ids(await list(a, '')), ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12']);
    assert.deepEqual(ids(await list(a, '?sort=-createdAt')).slice(0, 3), ['t12', 't11', 't10']);
    assert.deepEqual(ids(await list(a, '?sort=priority')), ['t1', 't2', 't6', 't9', 't3', 't5', 't8', 't10', 't12', 't4', 't7', 't11']);
    assert.deepEqual(ids(await list(a, '?sort=-priority')), ['t4', 't7', 't11', 't3', 't5', 't8', 't10', 't12', 't1', 't2', 't6', 't9']);
    assert.deepEqual(ids(await list(a, '?sort=dueDate')), ['t8', 't12', 't1', 't9', 't5', 't6', 't2', 't11', 't4', 't7', 't3', 't10']);
    assert.deepEqual(ids(await list(a, '?sort=-dueDate')), ['t7', 't4', 't11', 't2', 't5', 't6', 't1', 't9', 't12', 't8', 't3', 't10']);
    for (const s of ['title', '-title']) {
      const o = ids(await list(a, `?sort=${s}`));
      assert.equal(o.length, 12);
      const asc = s === 'title';
      const before = (x, y) => (asc ? o.indexOf(x) < o.indexOf(y) : o.indexOf(x) > o.indexOf(y));
      assert.ok(before('t12', 't10'), 'Cập < Đào'); // C < Đ
      assert.ok(before('t10', 't4'), 'Đào < Gửi'); // Đ < G (đ đứng sau d, trước e/g)
      assert.ok(before('t5', 't8'), 'Hợp < Hướng');
    }
  }));

test('phân trang: pageSize, trang cuối, vượt trang', () =>
  withApp(async (a) => {
    let r = await list(a, '?pageSize=5');
    assert.deepEqual([r.json.page, r.json.pageSize, r.json.total], [1, 5, 12]);
    assert.deepEqual(ids(r), ['t1', 't2', 't3', 't4', 't5']);
    r = await list(a, '?pageSize=5&page=3');
    assert.deepEqual(ids(r), ['t11', 't12']);
    r = await list(a, '?pageSize=5&page=4');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items, []);
    assert.deepEqual([r.json.page, r.json.pageSize, r.json.total], [4, 5, 12]);
    r = await list(a, '?page=999');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items, []);
    assert.equal(r.json.total, 12);
    r = await list(a, '');
    assert.deepEqual([r.json.page, r.json.pageSize, r.json.items.length], [1, 20, 12]);
    assert.equal((await list(a, '?pageSize=100')).status, 200);
    assert.equal((await list(a, '?pageSize=1&page=12')).json.items[0].id, 't12');
    // total là số khớp bộ lọc, không phải số của trang
    r = await list(a, '?status=todo&pageSize=2&page=2');
    assert.deepEqual([r.json.total, r.json.items.length], [6, 2]);
  }));

test('INVALID_QUERY: giá trị sai, tham số lạ, trùng, thứ tự theo URL', () =>
  withApp(async (a) => {
    const bad = {
      '?status=lala': 'status', '?status=todo,lala': 'status', '?team=C': 'team', '?team=a': 'team',
      '?dueBefore=2026-02-30': 'dueBefore', '?dueBefore=2026-13-01': 'dueBefore', '?dueBefore=26-1-1': 'dueBefore', '?dueBefore=abc': 'dueBefore',
      '?sort=id': 'sort', '?sort=--title': 'sort', '?sort=status': 'sort',
      '?page=0': 'page', '?page=1.5': 'page', '?page=abc': 'page', '?page=-1': 'page',
      '?pageSize=0': 'pageSize', '?pageSize=101': 'pageSize', '?pageSize=1.5': 'pageSize', '?pageSize=abc': 'pageSize',
      '?bogus=1': 'bogus',
      '?page=1&page=2': 'page', '?status=todo&status=done': 'status', '?q=a&q=b': 'q',
      // nhiều lỗi → tham số đầu tiên theo thứ tự trên URL
      '?page=0&status=lala': 'page', '?status=lala&page=0': 'status', '?bogus=1&team=C': 'bogus',
      '?team=C&sort=zzz&page=0': 'team', '?pageSize=0&sort=zzz': 'pageSize',
    };
    for (const [qs, field] of Object.entries(bad)) {
      const r = await list(a, qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY', qs);
      assert.equal(r.json.error.field, field, qs);
    }
    assert.equal((await list(a, '?dueBefore=2028-02-29')).status, 200); // năm nhuận hợp lệ
    assert.equal((await list(a, '?dueBefore=2027-02-29')).status, 400);
    // member cũng bị kiểm tra query
    assert.equal((await list(a, '?page=0', 'u3')).status, 400);
  }));

test('CSV: header, BOM, CRLF, escape, chống công thức', () =>
  withApp(async (a) => {
    const res = await fetch(a.base + '/tasks/export.csv', { headers: { 'x-user': 'u1' } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type').toLowerCase().replace(/\s/g, ''), 'text/csv;charset=utf-8');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.notDeepEqual([...buf.subarray(3, 6)], [0xef, 0xbb, 0xbf], 'BOM chỉ một lần');
    const text = buf.subarray(3).toString('utf8');
    assert.ok(text.endsWith('\r\n'), 'CRLF sau dòng cuối');
    assert.ok(!/[^\r]\n(?=id,|t\d+,)/.test(text), 'ngắt dòng bản ghi phải là CRLF');
    const lines = text.split('\r\n');
    assert.equal(lines[0], 'id,title,status,priority,assignee,team,dueDate,createdAt');
    assert.equal(lines.at(-1), '');
    assert.equal(lines.length, 1 + 12 + 1);
    assert.equal(lines[1], 't1,Thiết kế cơ sở dữ liệu,done,1,u3,A,2026-11-05,2026-10-01T08:00:00.000Z');
    assert.equal(lines[3], 't3,Kiểm thử tải hệ thống,todo,2,u6,A,,2026-10-03T08:00:00.000Z'); // dueDate null → ô trống
    assert.equal(lines[6], 't6,Rà soát quyền truy cập,todo,1,,B,2026-11-08,2026-10-06T08:00:00.000Z'); // assignee null → ô trống
    assert.equal(lines[7], 't7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,2026-10-07T08:00:00.000Z');
    // t8 có \n trong title → bị bọc ngoặc kép, \n giữ nguyên
    assert.equal(lines[8], 't8,"Hướng dẫn sử dụng\nphiên bản 2",done,2,u3,A,2026-10-30,2026-10-08T08:00:00.000Z');
  }));

test('CSV: dòng t8 nguyên vẹn, t11 chống công thức với "-"', () =>
  withApp(async (a) => {
    const r = await a.call('GET', '/tasks/export.csv', as('u1'));
    const text = r.text.replace(/^﻿/, '');
    assert.ok(text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done,2,u3,A,2026-10-30,2026-10-08T08:00:00.000Z\r\n'));
    assert.ok(text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,2026-10-11T08:00:00.000Z\r\n"));
    assert.ok(text.includes('t10,Đào tạo người dùng mới,todo,2,u4,B,,2026-10-10T08:00:00.000Z\r\n'));
  }));

test('CSV: tạo dữ liệu có ký tự đặc biệt (@, +, tab, \\r, ")', () =>
  withApp(async (a) => {
    const titles = ['@cmd', '+1', '\tTab', '\rCR', 'a"b', 'x\r\ny', '=1+1'];
    for (const title of titles) {
      const c = await a.call('POST', '/tasks', as('u1', { body: { title, team: 'A' } }));
      assert.equal(c.status, 201, title);
    }
    const r = await a.call('GET', '/tasks/export.csv?q=&status=todo&assignee=none&team=A&sort=-createdAt', as('u1'));
    const t = r.text.replace(/^﻿/, '');
    assert.ok(t.includes(",'@cmd,") || t.includes("t13,'@cmd,"), '@');
    assert.ok(t.includes("'+1,"), '+');
    assert.ok(t.includes('"\'\tTab"') || t.includes("'\tTab,"), 'tab có tiền tố nháy');
    assert.ok(t.includes('"\'\rCR"'), '\\r có tiền tố nháy và bọc ngoặc kép');
    assert.ok(t.includes('"a""b"'), 'nhân đôi dấu "');
    assert.ok(t.includes('"x\r\ny"'), 'CRLF trong trường được bọc');
    assert.ok(t.includes("'=1+1,"), '=');
    // priority (số) không bị thêm nháy
    assert.ok(/,todo,2,,A,,/.test(t));
  }));

test('CSV: bộ lọc/sắp xếp/quyền như danh sách, không phân trang', () =>
  withApp(async (a) => {
    const r = await a.call('GET', '/tasks/export.csv?team=B&sort=-priority', as('u1'));
    const rows = r.text.replace(/^﻿/, '').split('\r\n').slice(1, -1).map((l) => l.split(',')[0]);
    assert.deepEqual(rows, ['t4', 't5', 't10', 't12', 't6']);
    const m = await a.call('GET', '/tasks/export.csv', as('u3'));
    const mrows = m.text.replace(/^﻿/, '').split('\r\n').slice(1, -1);
    assert.equal(mrows.length, 7);
    assert.ok(mrows.every((l) => /,A,/.test(l)));
    const none = await a.call('GET', '/tasks/export.csv?team=B', as('u3'));
    assert.equal(none.status, 200);
    assert.equal(none.text.replace(/^﻿/, ''), 'id,title,status,priority,assignee,team,dueDate,createdAt\r\n');
    const q = await a.call('GET', '/tasks/export.csv?q=dac%20ta', as('u1'));
    assert.deepEqual(q.text.replace(/^﻿/, '').split('\r\n').slice(1, -1).map((l) => l.split(',')[0]), ['t4', 't12']);
    for (const qs of ['?page=1', '?pageSize=5', '?page=1&pageSize=5']) {
      const e = await a.call('GET', '/tasks/export.csv' + qs, as('u1'));
      assert.equal(e.status, 400, qs);
      assert.equal(e.json.error.code, 'INVALID_QUERY');
      assert.equal(e.json.error.field, qs.startsWith('?page=') ? 'page' : 'pageSize');
    }
    assert.equal((await a.call('GET', '/tasks/export.csv?bogus=1', as('u1'))).status, 400);
    assert.equal((await a.call('GET', '/tasks/export.csv?status=x', as('u1'))).json.error.field, 'status');
  }));

test('audit: create / update / delete, seq, at, changes, lọc taskId, quyền', () =>
  withApp(async (a) => {
    assert.deepEqual((await a.call('GET', '/audit', as('u1'))).json, { items: [] });
    const c = await a.call('POST', '/tasks', as('u1', { body: { title: 'Mới', team: 'A', priority: 3 } }));
    assert.equal(c.status, 201);
    const id = c.json.id;
    // thao tác lỗi không ghi
    assert.equal((await a.call('POST', '/tasks', as('u1', { body: { title: 'x' } }))).status, 400);
    assert.equal((await a.call('POST', '/tasks', as('u3', { body: { title: 'x', team: 'A' } }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t4', as('u2', { body: { title: 'z' } }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t999', as('u1', { body: { title: 'z' } }))).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t999', as('u1'))).status, 404);
    assert.equal((await a.call('GET', '/audit', as('u1'))).json.items.length, 1);

    // update: chỉ trường đổi giá trị thật sự; priority 3 → 3 là không đổi
    const p = await a.call('PATCH', `/tasks/${id}`, as('u2', { body: { title: 'Mới 2', priority: 3, status: 'doing', assignee: 'u3' } }));
    assert.equal(p.status, 200);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'doing' } }))).status, 200);
    assert.equal((await a.call('DELETE', `/tasks/${id}`, as('u1'))).status, 204);

    const r = await a.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json), ['items']);
    assert.deepEqual(r.json.items.map((e) => e.seq), [4, 3, 2, 1]);
    const at = '2026-11-01T00:00:00.000Z';
    assert.deepEqual(r.json.items[3], { seq: 1, at, userId: 'u1', action: 'create', taskId: id, changes: ['priority', 'team', 'title'] });
    assert.deepEqual(r.json.items[2], { seq: 2, at, userId: 'u2', action: 'update', taskId: id, changes: ['assignee', 'status', 'title'] });
    assert.deepEqual(r.json.items[1], { seq: 3, at, userId: 'u3', action: 'update', taskId: 't1', changes: ['status'] });
    assert.deepEqual(r.json.items[0], { seq: 4, at, userId: 'u1', action: 'delete', taskId: id, changes: [] });

    const f = await a.call('GET', `/audit?taskId=${id}`, as('u1'));
    assert.deepEqual(f.json.items.map((e) => e.seq), [4, 2, 1]);
    assert.deepEqual((await a.call('GET', '/audit?taskId=t1', as('u1'))).json.items.map((e) => e.seq), [3]);
    assert.deepEqual((await a.call('GET', '/audit?taskId=nope', as('u1'))).json, { items: [] });

    for (const qs of ['?page=1', '?bogus=1', '?taskId=t1&x=1']) {
      const e = await a.call('GET', '/audit' + qs, as('u1'));
      assert.equal(e.status, 400, qs);
      assert.equal(e.json.error.code, 'INVALID_QUERY');
    }
    for (const u of ['u2', 'u3', 'u5']) {
      const e = await a.call('GET', '/audit', as(u));
      assert.equal(e.status, 403, u);
      assert.equal(e.json.error.code, 'FORBIDDEN');
    }
  }));

test('audit: dùng đồng hồ của createServer và seq tăng liên tục', () =>
  (async () => {
    let n = 0;
    const app = await start({ now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, n++)) });
    try {
      const c = await app.call('POST', '/tasks', as('u1', { body: { title: 'a', team: 'A' } }));
      await app.call('DELETE', `/tasks/${c.json.id}`, as('u1'));
      const items = (await app.call('GET', '/audit', as('u1'))).json.items;
      assert.equal(items.length, 2);
      assert.ok(items[0].at > items[1].at);
      assert.match(items[1].at, /^2026-01-01T00:00:\d\d\.000Z$/);
    } finally {
      await app.close();
    }
  })());

test('GET /tasks trả {items,total,page,pageSize}; phần tử có đủ trường', () =>
  withApp(async (a) => {
    const r = await list(a, '?pageSize=1');
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json).sort(), ['items', 'page', 'pageSize', 'total']);
    assert.deepEqual(Object.keys(r.json.items[0]).sort(), ['assignee', 'createdAt', 'dueDate', 'id', 'priority', 'status', 'team', 'title']);
  }));
