'use strict';

/** Nhật ký thao tác trong bộ nhớ; seq tăng từ 1. */
class AuditLog {
  constructor(now = () => new Date()) {
    this.now = now;
    this.entries = [];
  }

  record({ userId, action, taskId, changes }) {
    const entry = { seq: this.entries.length + 1, at: this.now().toISOString(), userId, action, taskId, changes: [...(changes || [])] };
    this.entries.push(entry);
    return entry;
  }

  /** Mới nhất trước; `taskId` (tùy chọn) để lọc. */
  list({ taskId } = {}) {
    const all = taskId === undefined ? this.entries : this.entries.filter((e) => e.taskId === taskId);
    return all.slice().reverse();
  }
}

/** Các trường có giá trị mới khác giá trị cũ, sắp a→z. */
function diffFields(oldTask, newFields) {
  return Object.keys(newFields || {})
    .filter((k) => newFields[k] !== oldTask[k])
    .sort();
}

module.exports = { AuditLog, diffFields };
