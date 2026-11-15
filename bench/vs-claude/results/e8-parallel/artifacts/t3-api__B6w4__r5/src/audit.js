'use strict';

/** Nhật ký thao tác trong bộ nhớ. */
class AuditLog {
  constructor(now = () => new Date()) {
    this.now = now;
    this.entries = [];
    this.seq = 0;
  }

  record({ userId, action, taskId, changes } = {}) {
    const entry = {
      seq: ++this.seq,
      at: this.now().toISOString(),
      userId,
      action,
      taskId,
      changes: Array.isArray(changes) ? [...changes].sort() : [],
    };
    this.entries.push(entry);
    return { ...entry, changes: [...entry.changes] };
  }

  list({ taskId } = {}) {
    return this.entries
      .filter((e) => taskId === undefined || e.taskId === taskId)
      .map((e) => ({ ...e, changes: [...e.changes] }))
      .sort((a, b) => b.seq - a.seq);
  }
}

function same(a, b) {
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]));
  }
  return false;
}

/** Tên trường trong patch có giá trị khác task cũ, sắp a→z. */
function diffChanges(oldTask, patch) {
  const o = oldTask || {};
  return Object.keys(patch || {})
    .filter((k) => !same(o[k], patch[k]))
    .sort();
}

module.exports = { AuditLog, diffChanges };
