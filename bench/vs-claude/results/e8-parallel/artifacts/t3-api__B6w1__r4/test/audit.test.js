'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AuditLog, diffChanges } = require('../src/audit');

test('record/list: seq tăng, mới nhất trước, lọc taskId', () => {
  const log = new AuditLog(() => new Date('2026-11-01T00:00:00Z'));
  const a = log.record({ userId: 1, action: 'create', taskId: 1, changes: ['title'] });
  log.record({ userId: 2, action: 'update', taskId: 2, changes: [] });
  log.record({ userId: 1, action: 'delete', taskId: 1, changes: [] });
  assert.deepEqual(a, { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 1, action: 'create', taskId: 1, changes: ['title'] });
  assert.deepEqual(log.list().map((e) => e.seq), [3, 2, 1]);
  assert.deepEqual(log.list({ taskId: 1 }).map((e) => e.seq), [3, 1]);
});

test('diffChanges: chỉ trường khác, sắp a→z', () => {
  assert.deepEqual(diffChanges({ title: 'a', status: 'todo', priority: 1 }, { title: 'a', status: 'done', priority: 2 }), ['priority', 'status']);
  assert.deepEqual(diffChanges({ title: 'a' }, { title: 'a' }), []);
  assert.deepEqual(diffChanges({ assignee: null }, { assignee: 'x' }), ['assignee']);
});
