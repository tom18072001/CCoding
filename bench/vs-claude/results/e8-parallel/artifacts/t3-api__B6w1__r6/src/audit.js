'use strict';

/** Nhật ký thao tác trong bộ nhớ. */
class AuditLog {
  constructor(now) {
    this.now = now;
    this.entries = [];
  }

  record(userId, action, taskId, changes) {
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

  list(taskId) {
    return this.entries.filter((e) => taskId === undefined || e.taskId === taskId).reverse();
  }
}

module.exports = { AuditLog };
