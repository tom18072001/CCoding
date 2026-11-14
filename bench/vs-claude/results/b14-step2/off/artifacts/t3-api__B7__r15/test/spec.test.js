'use strict';
// Bộ test HTTP theo đặc tả FEATURES.md (đợt 0.4). Dùng seed riêng, không phụ thuộc data/seed.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });
const FIXED = () => new Date('2026-11-01T00:00:00Z');

const USERS = [
  { id: 'adm', name: 'Admin', role: 'admin', team: null },
  { id: 'mA', name: 'Manager A', role: 'manager', team: 'A' },
  { id: 'mB', name: 'Manager B', role: 'manager', team: 'B' },
  { id: 's1', name: 'Member A', role: 'member', team: 'A' },
  { id: 's2', name: 'Member B', role: 'member', team: 'B' },
];

const task = (id, title, status, priority, assignee, team, dueDate, day) => ({
  id, title, status, priority, assignee, team, dueDate, createdAt: `2026-01-0${day}T00:00:00.000Z`,
});

const TASKS = () => [
  task('t1', 'Đường dẫn', 'todo', 2, 's1', 'A', '2026-05-01', 1),
  task('t2', 'Bảng ĐÀO tạo', 'doing', 1, 's2', 'B', '2026-03-01', 2),
  task('t10', 'Cuối kỳ', 'done', 1, null, 'A', null, 3),
  task('t3', 'Alpha', 'todo', 1, null, 'B', '2026-03-01', 4),
  task('t11', 'beta', 'todo', 2, 's1', 'A', null, 5),
];

async function withApp(fn, opts = {}) {
  const app = await start({ seed: { users: USERS, tasks: opts.tasks ?? TASKS() }, now: opts.now ?? FIXED });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

const ids = (r) => r.json.items.map((t) => t.id);
const err = (r) => [r.status, r.json?.error?.code];

// ───────────────────────── 1. Xác thực & phân quyền ─────────────────────────

test('401: thiếu/sai X-User trên mọi route /tasks… và /audit, đứng trước 400/404/403', async () => {
  await withApp(async (app) => {
    const calls = [
      ['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'],
      ['POST', '/tasks', { title: 'x', team: 'A' }], ['PATCH', '/tasks/t1', { status: 'done' }],
      ['DELETE', '/tasks/t1'], ['GET', '/tasks?bogus=1'], ['GET', '/tasks/t99'], ['POST', '/tasks', { title: '' }],
      ['GET', '/audit?x=1'],
    ];
    for (const [m, p, body] of calls) {
      assert.deepEqual(err(await app.call(m, p, { body })), [401, 'UNAUTHENTICATED'], `${m} ${p} (không header)`);
      assert.deepEqual(err(await app.call(m, p, { body, headers: as('nobody') })), [401, 'UNAUTHENTICATED'], `${m} ${p} (user lạ)`);
    }
  });
});

test('admin làm được mọi việc', async () => {
  await withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks', { headers: as('adm') })).json.total, 5);
    assert.equal((await app.call('POST', '/tasks', { headers: as('adm'), body: { title: 'N', team: 'B' } })).status, 201);
    const p = await app.call('PATCH', '/tasks/t2', { headers: as('adm'), body: { team: 'A', title: 'Đổi' } });
    assert.equal(p.status, 200);
    assert.equal(p.json.team, 'A');
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: as('adm') })).status, 204);
    assert.equal((await app.call('DELETE', '/tasks/t99', { headers: as('adm') })).status, 404);
    assert.equal((await app.call('GET', '/audit', { headers: as('adm') })).status, 200);
  });
});

test('manager: đọc mọi nhóm, tạo/sửa trong nhóm mình, không xóa, không chuyển nhóm', async () => {
  await withApp(async (app) => {
    const h = as('mA');
    assert.equal((await app.call('GET', '/tasks', { headers: h })).json.total, 5);
    assert.equal((await app.call('GET', '/tasks/t2', { headers: h })).status, 200); // nhóm B vẫn đọc được
    assert.equal((await app.call('POST', '/tasks', { headers: h, body: { title: 'x', team: 'A' } })).status, 201);
    assert.deepEqual(err(await app.call('POST', '/tasks', { headers: h, body: { title: 'x', team: 'B' } })), [403, 'FORBIDDEN']);
    // 403 trước validate body
    assert.equal((await app.call('POST', '/tasks', { headers: h, body: { title: '', team: 'B' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { title: 'Sửa', priority: 3 } })).status, 200);
    assert.deepEqual(err(await app.call('PATCH', '/tasks/t2', { headers: h, body: { title: 'x' } })), [403, 'FORBIDDEN']);
    assert.equal((await app.call('PATCH', '/tasks/t2', { headers: h, body: { title: '' } })).status, 403);
    assert.deepEqual(err(await app.call('PATCH', '/tasks/t1', { headers: h, body: { team: 'B' } })), [403, 'FORBIDDEN']);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { team: 'A' } })).status, 200);
    assert.deepEqual(err(await app.call('DELETE', '/tasks/t1', { headers: h })), [403, 'FORBIDDEN']);
    assert.deepEqual(err(await app.call('DELETE', '/tasks/t2', { headers: h })), [403, 'FORBIDDEN']);
    // 404 trước 403
    assert.equal((await app.call('PATCH', '/tasks/t99', { headers: h, body: { title: 'x' } })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t99', { headers: h })).status, 404);
    // validate sau cùng
    const v = await app.call('PATCH', '/tasks/t1', { headers: h, body: { title: '' } });
    assert.equal(v.status, 400);
    assert.equal(v.json.error.field, 'title');
  });
});

test('member: chỉ thấy nhóm mình, nhiệm vụ nhóm khác → 404 (GET/PATCH/DELETE)', async () => {
  await withApp(async (app) => {
    const h = as('s1');
    const l = await app.call('GET', '/tasks', { headers: h });
    assert.deepEqual(ids(l).sort(), ['t1', 't10', 't11']);
    assert.equal(l.json.total, 3);
    assert.equal((await app.call('GET', '/tasks/t1', { headers: h })).status, 200);
    assert.deepEqual(err(await app.call('GET', '/tasks/t2', { headers: h })), [404, err(await app.call('GET', '/tasks/t99', { headers: h }))[1]]);
    assert.equal((await app.call('GET', '/tasks/t2', { headers: h })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t2', { headers: h, body: { status: 'done' } })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t2', { headers: h, body: { title: '' } })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t2', { headers: h })).status, 404);
    // team của nhóm khác → rỗng, không lỗi
    const o = await app.call('GET', '/tasks?team=B', { headers: h });
    assert.deepEqual([o.status, o.json.items, o.json.total], [200, [], 0]);
    assert.equal((await app.call('GET', '/tasks?team=A', { headers: h })).json.total, 3);
  });
});

test('member: không tạo/xóa; chỉ sửa status của nhiệm vụ giao cho mình', async () => {
  await withApp(async (app) => {
    const h = as('s1');
    assert.deepEqual(err(await app.call('POST', '/tasks', { headers: h, body: { title: 'x', team: 'A' } })), [403, 'FORBIDDEN']);
    assert.equal((await app.call('POST', '/tasks', { headers: h, body: { title: '' } })).status, 403);
    assert.deepEqual(err(await app.call('DELETE', '/tasks/t1', { headers: h })), [403, 'FORBIDDEN']);
    // không giao cho mình (assignee null / người khác trong cùng nhóm)
    assert.deepEqual(err(await app.call('PATCH', '/tasks/t10', { headers: h, body: { status: 'doing' } })), [403, 'FORBIDDEN']);
    // trường khác status, kể cả trùng giá trị cũ
    assert.deepEqual(err(await app.call('PATCH', '/tasks/t1', { headers: h, body: { status: 'done', title: 'x' } })), [403, 'FORBIDDEN']);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { title: 'Đường dẫn' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { status: 'todo', priority: 2 } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { title: '' } })).status, 403);
    // hợp lệ
    const ok = await app.call('PATCH', '/tasks/t1', { headers: h, body: { status: 'doing' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'doing');
    // validate sau 403
    const bad = await app.call('PATCH', '/tasks/t1', { headers: h, body: { status: 'zzz' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.field, 'status');
  });
});

// ───────────────────────── 2. Lọc, tìm, sắp xếp, phân trang ─────────────────────────

test('GET /tasks: dạng kết quả và mặc định', async () => {
  await withApp(async (app) => {
    const r = await app.call('GET', '/tasks', { headers: as('adm') });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json).sort(), ['items', 'page', 'pageSize', 'total']);
    assert.equal(r.json.page, 1);
    assert.equal(r.json.pageSize, 20);
    assert.equal(r.json.total, 5);
    assert.deepEqual(ids(r), ['t1', 't2', 't10', 't3', 't11']); // createdAt tăng dần
  });
});

test('lọc status/assignee/team/dueBefore', async () => {
  await withApp(async (app) => {
    const get = (q) => app.call('GET', '/tasks' + q, { headers: as('adm') });
    assert.deepEqual(ids(await get('?status=todo,doing')), ['t1', 't2', 't3', 't11']);
    assert.deepEqual(ids(await get('?status=done')), ['t10']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t10', 't3']);
    assert.deepEqual(ids(await get('?assignee=s1')), ['t1', 't11']);
    assert.deepEqual(ids(await get('?team=B')), ['t2', 't3']);
    assert.deepEqual(ids(await get('?team=A&status=todo&assignee=s1')), ['t1', 't11']);
    // dueBefore bao gồm ngày đó, loại nhiệm vụ không có dueDate
    assert.deepEqual(ids(await get('?dueBefore=2026-03-01')), ['t2', 't3']);
    assert.deepEqual(ids(await get('?dueBefore=2026-05-01')), ['t1', 't2', 't3']);
    assert.deepEqual(ids(await get('?dueBefore=2026-02-28')), []);
    // total = số khớp bộ lọc, không phải số trong trang
    const r = await get('?status=todo&pageSize=1');
    assert.equal(r.json.total, 3);
    assert.equal(r.json.items.length, 1);
  });
});

test('tìm q: không phân biệt hoa/thường và dấu tiếng Việt, đ/Đ → d, q rỗng = không lọc', async () => {
  await withApp(async (app) => {
    const get = (q) => app.call('GET', '/tasks' + q, { headers: as('adm') });
    assert.deepEqual(ids(await get('?q=dao tao')), ['t2']);
    assert.deepEqual(ids(await get('?q=%C4%90%C3%80O')), ['t2']); // "ĐÀO"
    assert.deepEqual(ids(await get('?q=duong')), ['t1']);
    assert.deepEqual(ids(await get('?q=%C4%91%C6%B0%E1%BB%9Dng')), ['t1']); // "đường"
    assert.deepEqual(ids(await get('?q=ALPHA')), ['t3']);
    assert.deepEqual(ids(await get('?q=ta')), ['t2', 't11']); // khớp chuỗi con: 'tao', 'beta'
    assert.equal((await get('?q=')).json.total, 5);
    assert.equal((await get('?q=khongco')).json.total, 0);
  });
});

test('sắp xếp: mặc định, priority, dueDate (null cuối), title, hòa theo số của id', async () => {
  await withApp(async (app) => {
    const get = (q) => app.call('GET', '/tasks' + q, { headers: as('adm') });
    assert.deepEqual(ids(await get('?sort=createdAt')), ['t1', 't2', 't10', 't3', 't11']);
    assert.deepEqual(ids(await get('?sort=-createdAt')), ['t11', 't3', 't10', 't2', 't1']);
    // priority hòa → id tăng theo số (t2 < t3 < t10), cả hai chiều
    assert.deepEqual(ids(await get('?sort=priority')), ['t2', 't3', 't10', 't1', 't11']);
    assert.deepEqual(ids(await get('?sort=-priority')), ['t1', 't11', 't2', 't3', 't10']);
    // dueDate: null luôn cuối, hòa theo id
    assert.deepEqual(ids(await get('?sort=dueDate')), ['t2', 't3', 't1', 't10', 't11']);
    assert.deepEqual(ids(await get('?sort=-dueDate')), ['t1', 't2', 't3', 't10', 't11']);
    // title theo locale vi: Alpha, Bảng, beta, Cuối, Đường
    assert.deepEqual(ids(await get('?sort=title')), ['t3', 't2', 't11', 't10', 't1']);
    assert.deepEqual(ids(await get('?sort=-title')), ['t1', 't10', 't11', 't2', 't3']);
  });
});

test('phân trang: page/pageSize, vượt trang → items rỗng', async () => {
  await withApp(async (app) => {
    const get = (q) => app.call('GET', '/tasks' + q, { headers: as('adm') });
    const p = await get('?page=2&pageSize=2');
    assert.deepEqual(ids(p), ['t10', 't3']);
    assert.deepEqual([p.json.total, p.json.page, p.json.pageSize], [5, 2, 2]);
    assert.deepEqual(ids(await get('?page=3&pageSize=2')), ['t11']);
    const far = await get('?page=9&pageSize=2');
    assert.deepEqual([far.status, far.json.items, far.json.total, far.json.page], [200, [], 5, 9]);
    assert.equal((await get('?pageSize=100')).json.pageSize, 100);
    assert.equal((await get('?pageSize=1')).json.items.length, 1);
  });
});

test('400 INVALID_QUERY: giá trị sai, tham số lạ, tham số lặp, báo tham số đầu tiên trên URL', async () => {
  await withApp(async (app) => {
    const cases = [
      ['?status=x', 'status'], ['?status=todo,x', 'status'], ['?status=', 'status'], ['?team=C', 'team'], ['?team=a', 'team'],
      ['?dueBefore=2026-02-30', 'dueBefore'], ['?dueBefore=2026-1-1', 'dueBefore'], ['?dueBefore=abc', 'dueBefore'],
      ['?dueBefore=2026-13-01', 'dueBefore'], ['?sort=foo', 'sort'], ['?sort=--title', 'sort'], ['?sort=id', 'sort'],
      ['?page=1.5', 'page'], ['?page=0', 'page'], ['?page=-1', 'page'], ['?page=abc', 'page'],
      ['?pageSize=0', 'pageSize'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'], ['?pageSize=2.5', 'pageSize'],
      ['?foo=1', 'foo'], ['?team=A&team=B', 'team'], ['?q=a&q=b', 'q'], ['?page=1&page=1', 'page'],
      ['?pageSize=0&status=x', 'pageSize'], ['?status=x&pageSize=0', 'status'], ['?team=A&foo=1&sort=bad', 'foo'],
    ];
    for (const [q, field] of cases) {
      const r = await app.call('GET', '/tasks' + q, { headers: as('adm') });
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY', q);
      assert.equal(r.json.error.field, field, q);
    }
    // 2026-02-29 không có thật (2026 không nhuận), 2028-02-29 có thật
    assert.equal((await app.call('GET', '/tasks?dueBefore=2026-02-29', { headers: as('adm') })).status, 400);
    assert.equal((await app.call('GET', '/tasks?dueBefore=2028-02-29', { headers: as('adm') })).status, 200);
  });
});

// ───────────────────────── 3. Xuất CSV ─────────────────────────

const CSV_HEADER = 'id,title,status,priority,assignee,team,dueDate,createdAt';

test('CSV: header HTTP, BOM, dòng tiêu đề, CRLF kể cả dòng cuối, null → ô trống', async () => {
  await withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?status=done', { headers: as('adm') });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.equal(r.text, `﻿${CSV_HEADER}\r\nt10,Cuối kỳ,done,1,,A,,2026-01-03T00:00:00.000Z\r\n`);
    // không khớp → chỉ có tiêu đề, vẫn kết thúc bằng CRLF
    const empty = await app.call('GET', '/tasks/export.csv?q=khongco', { headers: as('adm') });
    assert.equal(empty.text, `﻿${CSV_HEADER}\r\n`);
  });
});

test('CSV: RFC 4180 (bọc ngoặc kép, nhân đôi "), chống chèn công thức', async () => {
  const titles = [
    'a,b', 'say "hi"', 'dòng 1\ndòng 2', 'cr\rx', '=SUM(A1)', '+1', '-2', '@x', '\tTab', '\rCR đầu', '=a,"b"', 'ok=1', 'bình thường',
  ];
  const tasks = titles.map((t, i) => task(`t${i + 1}`, t, 'todo', 3, null, 'A', null, 1));
  await withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv', { headers: as('adm') });
    const row = (i, title) => `t${i},${title},todo,3,,A,,2026-01-01T00:00:00.000Z\r\n`;
    const expected =
      '﻿' + CSV_HEADER + '\r\n' +
      row(1, '"a,b"') +
      row(2, '"say ""hi"""') +
      row(3, '"dòng 1\ndòng 2"') +
      row(4, '"cr\rx"') +
      row(5, "'=SUM(A1)") +
      row(6, "'+1") +
      row(7, "'-2") +
      row(8, "'@x") +
      row(9, "'	Tab") + // tab đầu: thêm dấu nháy; tab không buộc bọc ngoặc
      row(10, "\"'\rCR đầu\"") + // \r đầu: thêm ' rồi bọc vì chứa \r
      row(11, `"'=a,""b"""`) + // thêm ' trước rồi mới bọc/nhân đôi
      row(12, 'ok=1') +
      row(13, 'bình thường');
    assert.equal(r.text, expected);
  }, { tasks });
});

test('CSV: số priority giữ nguyên, assignee/dueDate có giá trị, cột đúng thứ tự', async () => {
  await withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?assignee=s1&sort=-createdAt', { headers: as('adm') });
    assert.equal(
      r.text,
      `﻿${CSV_HEADER}\r\nt11,beta,todo,2,s1,A,,2026-01-05T00:00:00.000Z\r\nt1,Đường dẫn,todo,2,s1,A,2026-05-01,2026-01-01T00:00:00.000Z\r\n`,
    );
  });
});

test('CSV: dùng chung lọc/tìm/sắp xếp/quyền, không phân trang, tham số sai → 400', async () => {
  await withApp(async (app) => {
    const rows = (r) => r.text.split('\r\n').slice(1, -1).map((l) => l.split(',')[0]);
    assert.deepEqual(rows(await app.call('GET', '/tasks/export.csv', { headers: as('mA') })), ['t1', 't2', 't10', 't3', 't11']);
    assert.deepEqual(rows(await app.call('GET', '/tasks/export.csv?sort=-priority&status=todo', { headers: as('adm') })), ['t1', 't11', 't3']);
    assert.deepEqual(rows(await app.call('GET', '/tasks/export.csv?q=dao', { headers: as('adm') })), ['t2']);
    // member chỉ thấy nhóm mình; team khác → chỉ tiêu đề
    assert.deepEqual(rows(await app.call('GET', '/tasks/export.csv', { headers: as('s1') })), ['t1', 't10', 't11']);
    assert.deepEqual(rows(await app.call('GET', '/tasks/export.csv?team=B', { headers: as('s1') })), []);
    for (const [q, field] of [['?page=1', 'page'], ['?pageSize=5', 'pageSize'], ['?status=x', 'status'], ['?foo=1', 'foo'], ['?team=A&team=B', 'team']]) {
      const r = await app.call('GET', '/tasks/export.csv' + q, { headers: as('adm') });
      assert.equal(r.status, 400, q);
      assert.deepEqual([r.json.error.code, r.json.error.field], ['INVALID_QUERY', field], q);
    }
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1')).status, 401);
  });
});

// ───────────────────────── 4. Nhật ký thao tác ─────────────────────────

test('audit: ghi create/update/delete với seq từ 1, at theo now() của server, changes sắp a→z', async () => {
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 10, 1, 0, 0, tick++));
  await withApp(async (app) => {
    const c = await app.call('POST', '/tasks', { headers: as('adm'), body: { title: 'N', team: 'A', priority: 3 } });
    assert.equal(c.status, 201);
    const u = await app.call('PATCH', `/tasks/${c.json.id}`, { headers: as('mA'), body: { title: 'N', status: 'doing', priority: 1 } });
    assert.equal(u.status, 200);
    const d = await app.call('DELETE', `/tasks/${c.json.id}`, { headers: as('adm') });
    assert.equal(d.status, 204);
    const r = await app.call('GET', '/audit', { headers: as('adm') });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json), ['items']);
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]); // mới nhất trước
    assert.deepEqual(r.json.items.map((e) => [e.userId, e.action, e.taskId, e.changes]), [
      ['adm', 'delete', c.json.id, []],
      ['mA', 'update', c.json.id, ['priority', 'status']], // title không đổi giá trị → không có
      ['adm', 'create', c.json.id, ['priority', 'team', 'title']],
    ]);
    for (const e of r.json.items) {
      assert.match(e.at, /^2026-11-01T00:00:\d\d\.000Z$/);
      assert.deepEqual(Object.keys(e).sort(), ['action', 'at', 'changes', 'seq', 'taskId', 'userId']);
    }
    // at đi theo đồng hồ của server: tăng dần theo seq
    const ats = r.json.items.map((e) => e.at).reverse();
    assert.deepEqual([...ats].sort(), ats);
    assert.equal(new Set(ats).size, 3);
  }, { now });
});

test('audit: thao tác lỗi (401/403/404/400) không ghi; update không đổi gì vẫn ghi changes rỗng', async () => {
  await withApp(async (app) => {
    await app.call('POST', '/tasks', { body: { title: 'x', team: 'A' } }); // 401
    await app.call('POST', '/tasks', { headers: as('s1'), body: { title: 'x', team: 'A' } }); // 403
    await app.call('POST', '/tasks', { headers: as('mA'), body: { title: '', team: 'A' } }); // 400
    await app.call('PATCH', '/tasks/t99', { headers: as('adm'), body: { title: 'x' } }); // 404
    await app.call('PATCH', '/tasks/t2', { headers: as('mA'), body: { title: 'x' } }); // 403
    await app.call('PATCH', '/tasks/t1', { headers: as('adm'), body: { title: '' } }); // 400
    await app.call('DELETE', '/tasks/t1', { headers: as('mA') }); // 403
    await app.call('DELETE', '/tasks/t99', { headers: as('adm') }); // 404
    await app.call('GET', '/tasks', { headers: as('adm') }); // đọc không ghi
    assert.deepEqual((await app.call('GET', '/audit', { headers: as('adm') })).json.items, []);
    await app.call('PATCH', '/tasks/t1', { headers: as('adm'), body: { title: 'Đường dẫn', status: 'todo' } });
    const r = await app.call('GET', '/audit', { headers: as('adm') });
    assert.equal(r.json.items.length, 1);
    assert.deepEqual([r.json.items[0].seq, r.json.items[0].action, r.json.items[0].changes], [1, 'update', []]);
  });
});

test('audit: member đổi status được ghi với userId của member', async () => {
  await withApp(async (app) => {
    await app.call('PATCH', '/tasks/t1', { headers: as('s1'), body: { status: 'done' } });
    const e = (await app.call('GET', '/audit', { headers: as('adm') })).json.items[0];
    assert.deepEqual(
      e,
      { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 's1', action: 'update', taskId: 't1', changes: ['status'] },
    );
  });
});

test('GET /audit: chỉ admin, lọc taskId, tham số khác/lặp → 400', async () => {
  await withApp(async (app) => {
    await app.call('PATCH', '/tasks/t1', { headers: as('adm'), body: { status: 'done' } });
    await app.call('PATCH', '/tasks/t3', { headers: as('adm'), body: { status: 'done' } });
    await app.call('PATCH', '/tasks/t1', { headers: as('adm'), body: { status: 'todo' } });
    for (const u of ['mA', 's1', 's2']) assert.deepEqual(err(await app.call('GET', '/audit', { headers: as(u) })), [403, 'FORBIDDEN'], u);
    assert.deepEqual(err(await app.call('GET', '/audit')), [401, 'UNAUTHENTICATED']);
    const all = await app.call('GET', '/audit', { headers: as('adm') });
    assert.deepEqual(all.json.items.map((e) => e.seq), [3, 2, 1]);
    const t1 = await app.call('GET', '/audit?taskId=t1', { headers: as('adm') });
    assert.deepEqual(t1.json.items.map((e) => [e.seq, e.taskId]), [[3, 't1'], [1, 't1']]);
    assert.deepEqual((await app.call('GET', '/audit?taskId=t77', { headers: as('adm') })).json, { items: [] });
    // 401 > 400 > 403 theo thứ tự đặc tả: user thường + tham số lạ → 400 (tham số kiểm tra trước quyền)
    const bad = await app.call('GET', '/audit?x=1', { headers: as('adm') });
    assert.deepEqual([bad.status, bad.json.error.code, bad.json.error.field], [400, 'INVALID_QUERY', 'x']);
    assert.equal((await app.call('GET', '/audit?taskId=t1&taskId=t3', { headers: as('adm') })).status, 400);
    assert.equal((await app.call('GET', '/audit?taskId=t1&page=1', { headers: as('adm') })).status, 400);
  });
});
