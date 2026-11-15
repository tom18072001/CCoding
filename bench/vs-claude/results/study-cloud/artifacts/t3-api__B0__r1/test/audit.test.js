'use strict';
// Kỳ vọng lấy nguyên văn từ FEATURES.md mục 4. now cố định = 2026-11-01T00:00:00.000Z.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withApp, as, anon } = require('./_util');

const AT = '2026-11-01T00:00:00.000Z';
const audit = async (app, qs = '') => (await app.call('GET', '/audit' + qs)).json.items;

test('§4 seq bắt đầu từ 1, tăng dần; at = now().toISOString(); các trường mục', () => withApp(async (app) => {
  await app.call('PATCH', '/tasks/t1', { body: { title: 'Z', priority: 3 } });
  await app.call('PATCH', '/tasks/t2', { body: { status: 'done' } });
  const items = await audit(app);
  assert.deepEqual(items.map((e) => e.seq), [2, 1]); // mới nhất trước
  assert.deepEqual(items[1], { seq: 1, at: AT, userId: 'u1', action: 'update', taskId: 't1', changes: ['priority', 'title'] }); // a→z
}));

test('§4 create: changes = các trường có trong body (a→z), không tính giá trị mặc định', () => withApp(async (app) => {
  const c = await app.call('POST', '/tasks', { body: { team: 'A', title: 'Mới' } });
  const [e] = await audit(app);
  assert.equal(e.action, 'create');
  assert.equal(e.taskId, c.json.id);
  assert.deepEqual(e.changes, ['team', 'title']);
  assert.equal(e.at, AT);
}));

test('§4 update: chỉ trường có giá trị mới khác cũ; không đổi gì → changes []', () => withApp(async (app) => {
  const t = app.server.store.getTask('t1');
  await app.call('PATCH', '/tasks/t1', { body: { title: t.title, priority: 3 } }); // priority 1→3
  await app.call('PATCH', '/tasks/t1', { body: { status: 'done' } }); // đã là done
  await app.call('PATCH', '/tasks/t1', { body: {} });
  const items = await audit(app);
  assert.deepEqual(items.map((e) => e.changes), [[], [], ['priority']]);
  assert.ok(items.every((e) => e.action === 'update'));
}));

test('§4 member PATCH status trùng giá trị cũ → vẫn ghi update changes []', () => withApp(async (app) => {
  const t = app.server.store.getTask('t1');
  assert.equal((await app.call('PATCH', '/tasks/t1', { ...as('u3'), body: { status: t.status } })).status, 200);
  const [e] = await audit(app);
  assert.equal(e.userId, 'u3');
  assert.deepEqual(e.changes, []);
}));

test('§4 delete: changes [] và giữ taskId; userId đúng', () => withApp(async (app) => {
  await app.call('DELETE', '/tasks/t1');
  const [e] = await audit(app);
  assert.deepEqual(e, { seq: 1, at: AT, userId: 'u1', action: 'delete', taskId: 't1', changes: [] });
}));

test('§4 thao tác lỗi không ghi (400, 403, 404, 401, JSON hỏng)', () => withApp(async (app) => {
  await app.call('POST', '/tasks', { body: { title: '', team: 'A' } }); // 400
  await app.call('PATCH', '/tasks/t1', { body: { status: 'zzz' } }); // 400
  await app.call('PATCH', '/tasks/t4', { ...as('u3'), body: { status: 'done' } }); // 404
  await app.call('PATCH', '/tasks/t1', { ...as('u3'), body: { title: 'x' } }); // 403
  await app.call('DELETE', '/tasks/t1', as('u2')); // 403
  await app.call('DELETE', '/tasks/t999'); // 404
  await anon(app, 'DELETE', '/tasks/t1'); // 401
  const raw = await fetch(app.base + '/tasks/t1', { method: 'PATCH', headers: { 'x-user': 'u1', 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(raw.status, 400);
  assert.deepEqual(await audit(app), []);
}));

test('§4 GET /audit chỉ admin: manager/member → 403 FORBIDDEN', () => withApp(async (app) => {
  for (const u of ['u2', 'u3', 'u4', 'u5']) {
    const r = await app.call('GET', '/audit', as(u));
    assert.equal(r.status, 403, u);
    assert.equal(r.json.error.code, 'FORBIDDEN');
  }
}));

test('§4 /audit: tham số khác → 400 INVALID_QUERY (có field); taskId lặp → 400; 400 trước 403', () => withApp(async (app) => {
  const r = await app.call('GET', '/audit?x=1');
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'INVALID_QUERY');
  assert.equal(r.json.error.field, 'x');
  assert.equal((await app.call('GET', '/audit?taskId=t1&taskId=t2')).status, 400);
  assert.equal((await app.call('GET', '/audit?x=1', as('u3'))).status, 400); // thứ tự: 400 → 403
}));

test('§4 lọc taskId; thứ tự seq giảm dần; kết quả dạng { items }', () => withApp(async (app) => {
  await app.call('PATCH', '/tasks/t1', { body: { priority: 3 } });
  await app.call('PATCH', '/tasks/t2', { body: { priority: 3 } });
  await app.call('PATCH', '/tasks/t1', { body: { priority: 1 } });
  const r = await app.call('GET', '/audit?taskId=t1');
  assert.deepEqual(Object.keys(r.json), ['items']);
  assert.deepEqual(r.json.items.map((e) => [e.seq, e.taskId]), [[3, 't1'], [1, 't1']]);
  assert.deepEqual(await audit(app, '?taskId=t404'), []);
}));

test('§4 vòng đời create→update→delete cùng taskId, seq 1..3', () => withApp(async (app) => {
  const c = await app.call('POST', '/tasks', { body: { title: 'a', team: 'A' } });
  await app.call('PATCH', `/tasks/${c.json.id}`, { body: { priority: 3 } });
  await app.call('DELETE', `/tasks/${c.json.id}`);
  const items = await audit(app, `?taskId=${c.json.id}`);
  assert.deepEqual(items.map((e) => [e.seq, e.action]), [[3, 'delete'], [2, 'update'], [1, 'create']]);
}));
