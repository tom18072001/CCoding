'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { AuditLog } = require('../src/audit');

test('AuditLog: seq tăng từ 1, at theo now, changes sort a→z', () => {
  const log = new AuditLog(() => new Date('2026-01-02T03:04:05.000Z'));
  const e = log.record({ userId: 'u1', action: 'update', taskId: 't1', changes: ['status', 'assignee'] });
  assert.deepStrictEqual(e, { seq: 1, at: '2026-01-02T03:04:05.000Z', userId: 'u1', action: 'update', taskId: 't1', changes: ['assignee', 'status'] });
  assert.strictEqual(log.record({ userId: 'u1', action: 'delete', taskId: 't1', changes: [] }).seq, 2);
});

test('AuditLog: list mới nhất trước và lọc theo taskId', () => {
  const log = new AuditLog(() => new Date(0));
  log.record({ userId: 'a', action: 'create', taskId: 't1', changes: ['title'] });
  log.record({ userId: 'a', action: 'create', taskId: 't2', changes: [] });
  log.record({ userId: 'a', action: 'delete', taskId: 't1', changes: [] });
  assert.deepStrictEqual(log.list().map((e) => e.seq), [3, 2, 1]);
  assert.deepStrictEqual(log.list({ taskId: 't1' }).map((e) => e.seq), [3, 1]);
  assert.deepStrictEqual(log.list({ taskId: 'zz' }), []);
});
