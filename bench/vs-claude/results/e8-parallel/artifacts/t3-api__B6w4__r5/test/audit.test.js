'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AuditLog, diffChanges } = require('../src/audit');

function make() {
  let n = 0;
  return new AuditLog(() => new Date(Date.UTC(2026, 10, 1, 0, 0, n++)));
}

test('seq tăng từ 1 và at theo clock giả', () => {
  const log = make();
  const a = log.record({ userId: 'u1', action: 'create', taskId: 't1', changes: [] });
  const b = log.record({ userId: 'u1', action: 'update', taskId: 't1', changes: ['x'] });
  assert.equal(a.seq, 1);
  assert.equal(b.seq, 2);
  assert.equal(a.at, '2026-11-01T00:00:00.000Z');
  assert.equal(b.at, '2026-11-01T00:00:01.000Z');
});

test('list mới nhất trước và lọc theo taskId', () => {
  const log = make();
  log.record({ userId: 'u', action: 'a', taskId: 't1', changes: [] });
  log.record({ userId: 'u', action: 'b', taskId: 't2', changes: [] });
  log.record({ userId: 'u', action: 'c', taskId: 't1', changes: [] });
  assert.deepEqual(log.list().map((e) => e.seq), [3, 2, 1]);
  assert.deepEqual(log.list({ taskId: 't1' }).map((e) => e.seq), [3, 1]);
  assert.deepEqual(log.list({ taskId: 'zz' }), []);
});

test('changes sắp a→z, không đổi mảng đầu vào, không trùng tham chiếu', () => {
  const log = make();
  const input = ['title', 'assignee', 'status'];
  const e = log.record({ userId: 'u', action: 'update', taskId: 't1', changes: input });
  assert.deepEqual(input, ['title', 'assignee', 'status']);
  assert.deepEqual(e.changes, ['assignee', 'status', 'title']);
  e.changes.push('hack');
  const l = log.list();
  assert.deepEqual(l[0].changes, ['assignee', 'status', 'title']);
  l[0].changes.push('x');
  l[0].userId = 'evil';
  assert.equal(log.list()[0].changes.length, 3);
  assert.equal(log.list()[0].userId, 'u');
});

test('diffChanges', () => {
  const old = { title: 'A', status: 'todo', due: null, tags: ['x'] };
  assert.deepEqual(diffChanges(old, { title: 'A', status: 'done', due: null }), ['status']);
  assert.deepEqual(diffChanges(old, { due: '2026-01-01', title: 'B' }), ['due', 'title']);
  assert.deepEqual(diffChanges(old, { tags: ['x'] }), []);
  assert.deepEqual(diffChanges(old, { tags: ['y'] }), ['tags']);
  assert.deepEqual(diffChanges(old, {}), []);
});
