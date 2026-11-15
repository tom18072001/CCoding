'use strict';
// Bộ test đối chiếu độc lập với FEATURES.md, qua HTTP thật, seed riêng.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const SEED = {
  users: [
    { id: 'adm', name: 'Admin', role: 'admin', team: null },
    { id: 'mA', name: 'Manager A', role: 'manager', team: 'A' },
    { id: 'mB', name: 'Manager B', role: 'manager', team: 'B' },
    { id: 'eA', name: 'Member A', role: 'member', team: 'A' },
    { id: 'eA2', name: 'Member A2', role: 'member', team: 'A' },
    { id: 'eB', name: 'Member B', role: 'member', team: 'B' },
  ],
  tasks: [
    { id: 't1', title: 'Đặc tả yêu cầu', status: 'todo', priority: 2, assignee: 'eA', team: 'A', dueDate: '2026-03-10', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 't2', title: 'Đường dẫn', status: 'doing', priority: 1, assignee: 'eA2', team: 'A', dueDate: null, createdAt: '2026-01-02T00:00:00.000Z' },
    { id: 't10', title: 'dac ta khác', status: 'done', priority: 2, assignee: null, team: 'B', dueDate: '2026-03-10', createdAt: '2026-01-02T00:00:00.000Z' },
    { id: 't3', title: 'Zebra', status: 'todo', priority: 3, assignee: 'eB', team: 'B', dueDate: '2026-01-05', createdAt: '2026-01-03T00:00:00.000Z' },
    { id: 't11', title: '=1+1, "x"', status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-04T00:00:00.000Z' },
    { id: 't12', title: '@home\nline2', status: 'doing', priority: 1, assignee: 'eA', team: 'A', dueDate: '2026-12-31', createdAt: '2026-01-05T00:00:00.000Z' },
    { id: 't13', title: '+plus', status: 'todo', priority: 1, assignee: 'eB', team: 'B', dueDate: null, createdAt: '2026-01-06T00:00:00.000Z' },
  ],
};

const as = (id) => ({ 'x-user': id });

async function withApp(fn, options = {}) {
  const app = await start({ seed: SEED, ...options });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);

test('401: thiếu/sai X-User trên mọi route, và đứng trước 400/404', () =>
  withApp(async (app) => {
    for (const h of [{}, as('nobody')]) {
      for (const [m, p, body] of [
        ['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'],
        ['POST', '/tasks', { title: 'x', team: 'A' }], ['PATCH', '/tasks/t1', { status: 'done' }], ['DELETE', '/tasks/t1'],
        ['GET', '/tasks?foo=1'], ['GET', '/tasks/nope'], ['GET', '/audit?x=1'],
      ]) {
        const r = await app.call(m, p, { headers: h, body });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
  }));

test('phân quyền admin', () =>
  withApp(async (app) => {
    const c = await app.call('POST', '/tasks', { headers: as('adm'), body: { title: 'N', team: 'B' } });
    assert.equal(c.status, 201);
    assert.equal((await app.call('PATCH', `/tasks/${c.json.id}`, { headers: as('adm'), body: { team: 'A', title: 'M' } })).status, 200);
    assert.equal((await app.call('DELETE', `/tasks/${c.json.id}`, { headers: as('adm') })).status, 204);
    assert.equal((await app.call('GET', '/tasks/t3', { headers: as('adm') })).status, 200);
  }));

test('phân quyền manager', () =>
  withApp(async (app) => {
    const h = as('mA');
    assert.equal((await app.call('GET', '/tasks/t3', { headers: h })).status, 200); // đọc nhóm khác
    assert.equal((await app.call('GET', '/tasks', { headers: h })).json.total, 7);
    assert.equal((await app.call('POST', '/tasks', { headers: h, body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: h, body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { title: 'Mới', priority: 3, assignee: 'eA2' } })).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: h, body: { title: 'x' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { team: 'B' } })).status, 403);
    const d = await app.call('DELETE', '/tasks/t1', { headers: h });
    assert.equal(d.status, 403);
    assert.equal(d.json.error.code, 'FORBIDDEN');
    assert.equal((await app.call('DELETE', '/tasks/t3', { headers: h })).status, 403);
    assert.equal((await app.call('GET', '/tasks/t1', { headers: h })).status, 200); // chưa bị xóa
    assert.equal((await app.call('GET', '/tasks/nope', { headers: h })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/nope', { headers: h })).status, 404);
  }));

test('phân quyền member', () =>
  withApp(async (app) => {
    const h = as('eA');
    assert.equal((await app.call('GET', '/tasks/t1', { headers: h })).status, 200);
    assert.equal((await app.call('GET', '/tasks/t3', { headers: h })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: h, body: { status: 'done' } })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t3', { headers: h })).status, 404);
    assert.equal((await app.call('POST', '/tasks', { headers: h, body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: h })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', { headers: h, body: { status: 'done' } })).status, 403); // giao người khác
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { status: 'todo', title: 'x' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { title: 'x' } })).status, 403);
    const ok = await app.call('PATCH', '/tasks/t1', { headers: h, body: { status: 'doing' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'doing');
    assert.equal((await app.call('GET', '/tasks', { headers: h })).json.total, 4);
    assert.deepEqual(ids(await app.call('GET', '/tasks?team=B', { headers: h })), []);
    const err = await app.call('GET', '/tasks/t3', { headers: h });
    assert.equal(err.json.error.code, 'NOT_FOUND');
  }));

test('thứ tự kiểm tra: 401 → query 400 → 404 → 403 → body 400', () =>
  withApp(async (app) => {
    // query 400 đứng trước 403 audit
    assert.equal((await app.call('GET', '/audit?x=1', { headers: as('mA') })).status, 400);
    assert.equal((await app.call('GET', '/audit', { headers: as('mA') })).status, 403);
    // 404 đứng trước 403 (member, nhiệm vụ nhóm khác, thao tác bị cấm)
    assert.equal((await app.call('DELETE', '/tasks/t3', { headers: as('eA') })).status, 404);
    // 403 đứng trước validate body
    assert.equal((await app.call('POST', '/tasks', { headers: as('eA'), body: {} })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: as('mA'), body: { title: '', team: 'B' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: as('mA'), body: { status: 'bad' } })).status, 403);
    // qua quyền mới tới validate body
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: as('eA'), body: { status: 'bad' } })).status, 400);
    assert.equal((await app.call('POST', '/tasks', { headers: as('adm'), body: { title: '', team: 'A' } })).status, 400);
    assert.equal((await app.call('PATCH', '/tasks/nope', { headers: as('adm'), body: { status: 'bad' } })).status, 404);
  }));

test('lọc: status, assignee, team, dueBefore', () =>
  withApp(async (app) => {
    const get = (q) => app.call('GET', '/tasks' + q, { headers: as('adm') });
    assert.deepEqual(ids(await get('?status=doing,done')), ['t2', 't10', 't12']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t10', 't11']);
    assert.deepEqual(ids(await get('?assignee=eA')), ['t1', 't12']);
    assert.deepEqual(ids(await get('?team=B')), ['t10', 't3', 't13']);
    assert.deepEqual(ids(await get('?dueBefore=2026-03-10&sort=dueDate')), ['t3', 't1', 't10']);
    const all = await get('');
    assert.deepEqual(Object.keys(all.json).sort(), ['items', 'page', 'pageSize', 'total']);
    assert.deepEqual([all.json.total, all.json.page, all.json.pageSize], [7, 1, 20]);
  }));

test('q: không phân biệt hoa/thường và dấu', () =>
  withApp(async (app) => {
    const get = (q) => app.call('GET', '/tasks?q=' + encodeURIComponent(q), { headers: as('adm') });
    assert.deepEqual(ids(await get('dac ta')), ['t1', 't10']);
    assert.deepEqual(ids(await get('ĐẶC TẢ')), ['t1', 't10']);
    assert.deepEqual(ids(await get('duong')), ['t2']);
    assert.deepEqual(ids(await get('ĐƯỜNG')), ['t2']);
    assert.equal((await get('')).json.total, 7);
    assert.equal((await get('khongco')).json.total, 0);
  }));

test('sắp xếp: mặc định, tie-break id số, dueDate null cuối, priority, title', () =>
  withApp(async (app) => {
    const get = (q) => app.call('GET', '/tasks' + q, { headers: as('adm') });
    assert.deepEqual(ids(await get('')), ['t1', 't2', 't10', 't3', 't11', 't12', 't13']);
    // priority tăng: 1:{t2,t12,t13} 2:{t1,t10,t11} 3:{t3}; hòa theo id số tăng (t2<t10)
    assert.deepEqual(ids(await get('?sort=priority')), ['t2', 't12', 't13', 't1', 't10', 't11', 't3']);
    // giảm: hòa vẫn tăng dần theo id
    assert.deepEqual(ids(await get('?sort=-priority')), ['t3', 't1', 't10', 't11', 't2', 't12', 't13']);
    // createdAt giảm: t2 và t10 cùng createdAt, hòa id tăng
    assert.deepEqual(ids(await get('?sort=-createdAt')), ['t13', 't12', 't11', 't3', 't2', 't10', 't1']);
    // dueDate: null cuối ở cả hai chiều
    assert.deepEqual(ids(await get('?sort=dueDate')), ['t3', 't1', 't10', 't12', 't2', 't11', 't13']);
    assert.deepEqual(ids(await get('?sort=-dueDate')), ['t12', 't1', 't10', 't3', 't2', 't11', 't13']);
    // title (localeCompare vi): Zebra cuối khi tăng, đầu khi giảm
    const asc = ids(await get('?sort=title'));
    assert.equal(asc[asc.length - 1], 't3');
    assert.equal(ids(await get('?sort=-title'))[0], 't3');
  }));

test('phân trang', () =>
  withApp(async (app) => {
    const get = (q) => app.call('GET', '/tasks' + q, { headers: as('adm') });
    const p = await get('?page=2&pageSize=3');
    assert.deepEqual(ids(p), ['t3', 't11', 't12']);
    assert.deepEqual([p.json.page, p.json.pageSize, p.json.total], [2, 3, 7]);
    const beyond = await get('?page=5&pageSize=3');
    assert.equal(beyond.status, 200);
    assert.deepEqual([beyond.json.items, beyond.json.total], [[], 7]);
    assert.equal((await get('?pageSize=100')).status, 200);
    assert.equal((await get('?pageSize=1')).json.items.length, 1);
  }));

test('tham số sai/trùng/không biết → 400 INVALID_QUERY, báo theo thứ tự URL', () =>
  withApp(async (app) => {
    const cases = [
      ['?status=x', 'status'], ['?status=todo,bad', 'status'], ['?team=C', 'team'],
      ['?dueBefore=2026-02-30', 'dueBefore'], ['?dueBefore=2026-2-3', 'dueBefore'], ['?dueBefore=abc', 'dueBefore'],
      ['?sort=foo', 'sort'], ['?sort=--title', 'sort'],
      ['?page=1.5', 'page'], ['?page=0', 'page'], ['?page=abc', 'page'],
      ['?pageSize=0', 'pageSize'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'],
      ['?foo=1', 'foo'], ['?team=A&team=B', 'team'], ['?page=1&page=2', 'page'],
      ['?sort=x&page=0', 'sort'], ['?page=0&sort=x', 'page'], ['?team=A&foo=1&status=x', 'foo'],
    ];
    for (const [q, field] of cases) {
      const r = await app.call('GET', '/tasks' + q, { headers: as('adm') });
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY', q);
      assert.equal(r.json.error.field, field, q);
    }
  }));

test('CSV: byte thô, header, escape, chống công thức, lọc & quyền', () =>
  withApp(async (app) => {
    const res = await fetch(app.base + '/tasks/export.csv?team=A&sort=createdAt', { headers: as('adm') });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.notDeepEqual([...raw.subarray(3, 6)], [0xef, 0xbb, 0xbf]); // BOM không bị lặp
    const text = raw.subarray(3).toString('utf8');
    const expected = [
      'id,title,status,priority,assignee,team,dueDate,createdAt',
      't1,Đặc tả yêu cầu,todo,2,eA,A,2026-03-10,2026-01-01T00:00:00.000Z',
      't2,Đường dẫn,doing,1,eA2,A,,2026-01-02T00:00:00.000Z',
      't11,"\'=1+1, ""x""",todo,2,,A,,2026-01-04T00:00:00.000Z',
      't12,"\'@home\nline2",doing,1,eA,A,2026-12-31,2026-01-05T00:00:00.000Z',
    ];
    assert.equal(text, expected.join('\r\n') + '\r\n');
    // +, - ở đầu chuỗi
    const plus = await app.call('GET', '/tasks/export.csv?q=plus', { headers: as('adm') });
    assert.ok(plus.text.includes("t13,'+plus,todo,1,eB,B,,"));
    // page/pageSize bị cấm
    for (const q of ['?page=1', '?pageSize=5']) {
      const r = await app.call('GET', '/tasks/export.csv' + q, { headers: as('adm') });
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, q.slice(1, q.indexOf('=')));
    }
    assert.equal((await app.call('GET', '/tasks/export.csv?foo=1', { headers: as('adm') })).status, 400);
    // member chỉ thấy nhóm mình
    const mem = await app.call('GET', '/tasks/export.csv', { headers: as('eB') });
    assert.equal(mem.text.split('\r\n').length, 5); // tiêu đề + 3 nhiệm vụ + rỗng
    assert.ok(!mem.text.includes('t1,'));
    // CSV rỗng vẫn có BOM + tiêu đề
    const none = await app.call('GET', '/tasks/export.csv?q=khongco', { headers: as('adm') });
    assert.equal(none.text, 'id,title,status,priority,assignee,team,dueDate,createdAt\r\n');
  }));

test('audit: create/update/delete, seq, at, changes, lọc taskId, quyền', () =>
  withApp(async (app) => {
    const a = as('adm');
    const created = await app.call('POST', '/tasks', { headers: a, body: { title: 'N', team: 'A', priority: 2 } });
    const id = created.json.id;
    await app.call('PATCH', `/tasks/${id}`, { headers: a, body: { title: 'N', priority: 3, status: 'doing' } }); // title không đổi
    await app.call('POST', '/tasks', { headers: a, body: { title: '', team: 'A' } }); // lỗi
    await app.call('PATCH', '/tasks/nope', { headers: a, body: { status: 'done' } }); // lỗi
    await app.call('DELETE', '/tasks/nope', { headers: a }); // lỗi
    await app.call('PATCH', '/tasks/t1', { headers: as('eA'), body: { status: 'doing' } });
    await app.call('PATCH', '/tasks/t1', { headers: as('eA'), body: { title: 'x' } }); // 403, không ghi
    await app.call('DELETE', `/tasks/${id}`, { headers: a });
    const r = await app.call('GET', '/audit', { headers: a });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json), ['items']);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]), [
      [4, 'adm', 'delete', id, []],
      [3, 'eA', 'update', 't1', ['status']],
      [2, 'adm', 'update', id, ['priority', 'status']],
      [1, 'adm', 'create', id, ['priority', 'team', 'title']],
    ]);
    for (const e of r.json.items) assert.equal(Object.keys(e).sort().join(), 'action,at,changes,seq,taskId,userId');
    const f = await app.call('GET', `/audit?taskId=${id}`, { headers: a });
    assert.deepEqual(f.json.items.map((e) => e.seq), [4, 2, 1]);
    assert.deepEqual((await app.call('GET', '/audit?taskId=zzz', { headers: a })).json.items, []);
    // quyền
    for (const u of ['mA', 'eA']) {
      const x = await app.call('GET', '/audit', { headers: as(u) });
      assert.equal(x.status, 403);
      assert.equal(x.json.error.code, 'FORBIDDEN');
    }
    const bad = await app.call('GET', '/audit?x=1', { headers: a });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
  }));

test('audit: at lấy từ now() của createServer', () => {
  let n = 0;
  return withApp(async (app) => {
    await app.call('POST', '/tasks', { headers: as('adm'), body: { title: 'N', team: 'A' } });
    const r = await app.call('GET', '/audit', { headers: as('adm') });
    assert.match(r.json.items[0].at, /^2026-05-05T00:00:\d\d\.000Z$/);
    assert.equal(r.json.items[0].at, r.json.items[0].at.slice(0, 20) + '000Z');
  }, { now: () => new Date(Date.UTC(2026, 4, 5, 0, 0, ++n)) });
});
