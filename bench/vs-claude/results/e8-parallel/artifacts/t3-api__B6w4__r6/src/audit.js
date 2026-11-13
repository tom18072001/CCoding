'use strict';

/** Nhật ký thao tác trong bộ nhớ: seq tăng từ 1, list trả mới nhất trước. */
class AuditLog {
  constructor(now = () => new Date()) {
    this.now = now;
    this.entries = [];
  }

  record({ userId, action, taskId, changes = [] }) {
    const entry = {
      seq: this.entries.length + 1,
      at: this.now().toISOString(),
      userId,
      action,
      taskId,
      changes: [...changes].sort(),
    };
    this.entries.push(entry);
    return entry;
  }

  list({ taskId } = {}) {
    const rows = taskId === undefined ? this.entries : this.entries.filter((e) => String(e.taskId) === String(taskId));
    return rows.map((e) => ({ ...e, changes: [...e.changes] })).sort((a, b) => b.seq - a.seq);
  }
}

module.exports = { AuditLog };
