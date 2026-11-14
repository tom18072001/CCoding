'use strict';
// Kỳ vọng lấy nguyên văn từ FEATURES.md mục 1 + dòng "Thứ tự kiểm tra" đầu tài liệu. Seed mặc định:
// u1 admin; u2 manager A; u5 manager B; u3,u6 member A; u4 member B. t1,t2 (A, giao u3); t3 (A, giao u6); t4,t5 (B, giao u4).
const test = require('node:test');
const assert = require('node:assert/strict');
const { withApp, as, anon } = require('./_util');

const code = (r) => r.json && r.json.error && r.json.error.code;

test('§1 thiếu/sai X-User → 401 UNAUTHENTICATED trên mọi route', () => withApp(async (app) => {
  for (const [m, p, b] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['POST', '/tasks', { title: 'a', team: 'A' }], ['PATCH', '/tasks/t1', {}], ['DELETE', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit']]) {
    const r = await anon(app, m, p, b);
    assert.equal(r.status, 401, `${m} ${p}`);
    assert.equal(code(r), 'UNAUTHENTICATED');
  }
  assert.equal((await app.call('GET', '/tasks', as('nobody'))).status, 401);
}));

test('§Thứ tự: 401 đứng trước 400 (không X-User + query sai → 401)', () => withApp(async (app) => {
  assert.equal((await anon(app, 'GET', '/tasks?page=0')).status, 401);
  assert.equal((await anon(app, 'GET', '/audit?x=1')).status, 401);
}));

test('§Thứ tự: member GET /tasks query sai → 400 (không phải 403/404)', () => withApp(async (app) => {
  const r = await app.call('GET', '/tasks?page=0', as('u3'));
  assert.equal(r.status, 400);
  assert.equal(code(r), 'INVALID_QUERY');
}));

test('§1 member: GET task nhóm khác → 404, nhóm mình → 200', () => withApp(async (app) => {
  assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
  assert.equal((await app.call('GET', '/tasks/t1', as('u3'))).status, 200);
  assert.equal((await app.call('GET', '/tasks/t1', as('u4'))).status, 404);
}));

test('§1 + thứ tự 404 trước validate: member PATCH task nhóm khác với body sai → 404', () => withApp(async (app) => {
  const r = await app.call('PATCH', '/tasks/t4', { ...as('u3'), body: { title: '' , zzz: 1 } });
  assert.equal(r.status, 404);
}));

test('§1 member DELETE: task nhóm mình → 403, nhóm khác → 404', () => withApp(async (app) => {
  assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
  assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
  assert.ok(app.server.store.getTask('t1'));
}));

test('§1 member POST → 403 (kể cả body hợp lệ)', () => withApp(async (app) => {
  const r = await app.call('POST', '/tasks', { ...as('u3'), body: { title: 'a', team: 'A' } });
  assert.equal(r.status, 403);
  assert.equal(code(r), 'FORBIDDEN');
}));

test('§1 member PATCH task của mình với {title} → 403 (không phải 400), kể cả {title} rỗng', () => withApp(async (app) => {
  assert.equal((await app.call('PATCH', '/tasks/t1', { ...as('u3'), body: { title: 'Mới' } })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { ...as('u3'), body: { title: '' } })).status, 403);
}));

test('§1 member PATCH có trường khác status kèm status (kể cả trùng giá trị cũ) → 403', () => withApp(async (app) => {
  const t = app.server.store.getTask('t1');
  assert.equal((await app.call('PATCH', '/tasks/t1', { ...as('u3'), body: { status: t.status, priority: t.priority } })).status, 403);
}));

test('§1 member PATCH task cùng nhóm nhưng không giao cho mình → 403', () => withApp(async (app) => {
  assert.equal((await app.call('PATCH', '/tasks/t3', { ...as('u3'), body: { status: 'done' } })).status, 403); // t3 giao u6
}));

test('§1 member PATCH {status} task giao cho mình → 200; status sai → 400 VALIDATION', () => withApp(async (app) => {
  const r = await app.call('PATCH', '/tasks/t1', { ...as('u3'), body: { status: 'todo' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'todo');
  const bad = await app.call('PATCH', '/tasks/t1', { ...as('u3'), body: { status: 'zzz' } });
  assert.equal(bad.status, 400);
  assert.equal(code(bad), 'VALIDATION');
}));

test('§1 manager PATCH task nhóm khác → 403; task nhóm mình mọi trường → 200', () => withApp(async (app) => {
  assert.equal((await app.call('PATCH', '/tasks/t4', { ...as('u2'), body: { title: 'x' } })).status, 403);
  const r = await app.call('PATCH', '/tasks/t1', { ...as('u2'), body: { title: 'Đổi', priority: 3, assignee: 'u6', dueDate: null } });
  assert.equal(r.status, 200);
  assert.equal(r.json.title, 'Đổi');
}));

test('§1 manager PATCH team khác nhóm mình (kể cả team không hợp lệ) → 403; team = nhóm mình → 200', () => withApp(async (app) => {
  assert.equal((await app.call('PATCH', '/tasks/t1', { ...as('u2'), body: { team: 'B' } })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { ...as('u2'), body: { team: 'C' } })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { ...as('u2'), body: { team: 'A' } })).status, 200);
}));

test('§1 manager: đọc mọi nhóm; DELETE → 403; POST team khác → 403, đúng nhóm → 201', () => withApp(async (app) => {
  assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
  assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
  assert.equal((await app.call('POST', '/tasks', { ...as('u2'), body: { title: 'a', team: 'B' } })).status, 403);
  assert.equal((await app.call('POST', '/tasks', { ...as('u2'), body: { title: 'a', team: 'C' } })).status, 403);
  assert.equal((await app.call('POST', '/tasks', { ...as('u2'), body: { title: 'a', team: 'A' } })).status, 201);
}));

test('§1 admin làm mọi việc: PATCH mọi trường, đổi team, POST bất kỳ nhóm, DELETE', () => withApp(async (app) => {
  assert.equal((await app.call('PATCH', '/tasks/t4', { body: { team: 'A', title: 'x' } })).status, 200);
  assert.equal((await app.call('POST', '/tasks', { body: { title: 'a', team: 'B' } })).status, 201);
  assert.equal((await app.call('DELETE', '/tasks/t1')).status, 204);
}));

test('§1 các lần bị cấm không làm đổi dữ liệu', () => withApp(async (app) => {
  const before = JSON.stringify(app.server.store.listTasks());
  await app.call('PATCH', '/tasks/t1', { ...as('u3'), body: { title: 'hack' } });
  await app.call('DELETE', '/tasks/t1', as('u2'));
  await app.call('POST', '/tasks', { ...as('u3'), body: { title: 'a', team: 'A' } });
  assert.equal(JSON.stringify(app.server.store.listTasks()), before);
}));
