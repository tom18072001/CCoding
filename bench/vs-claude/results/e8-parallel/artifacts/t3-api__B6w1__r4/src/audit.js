'use strict';

class AuditLog {
  constructor(now = () => new Date()) {
    this.now = now;
    this.entries = [];
    this.seq = 0;
  }

  record({ userId, action, taskId, changes }) {
    const entry = { seq: ++this.seq, at: this.now().toISOString(), userId, action, taskId, changes };
    this.entries.push(entry);
    return entry;
  }

  list({ taskId } = {}) {
    const rows = taskId === undefined ? this.entries : this.entries.filter((e) => e.taskId === taskId);
    return rows.slice().reverse();
  }
}

function diffChanges(oldTask, patch) {
  const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
  return Object.keys(patch || {}).filter((k) => !same((oldTask || {})[k], patch[k])).sort();
}

module.exports = { AuditLog, diffChanges };
