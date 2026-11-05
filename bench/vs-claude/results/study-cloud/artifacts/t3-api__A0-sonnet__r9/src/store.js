'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SEED = path.join(__dirname, '..', 'data', 'seed.json');

/** Kho dữ liệu trong bộ nhớ. `now()` trả về Date — tiêm được để test. */
class Store {
  constructor({ seed, now } = {}) {
    const data = JSON.parse(JSON.stringify(seed ?? JSON.parse(fs.readFileSync(SEED, 'utf8'))));
    this.now = now ?? (() => new Date());
    this.users = new Map(data.users.map((u) => [u.id, u]));
    this.tasks = new Map(data.tasks.map((t) => [t.id, t]));
    this.auditLog = [];
    this.seq = data.tasks.reduce((m, t) => Math.max(m, Number(String(t.id).replace(/\D/g, '')) || 0), 0);
  }

  audit(userId, action, taskId, changes) {
    const entry = { seq: this.auditLog.length + 1, at: this.now().toISOString(), userId, action, taskId, changes };
    this.auditLog.push(entry);
    return entry;
  }

  user(id) {
    return this.users.get(id);
  }

  listTasks() {
    return [...this.tasks.values()];
  }

  getTask(id) {
    return this.tasks.get(id);
  }

  createTask(data) {
    const id = `t${++this.seq}`;
    const task = { id, ...data, createdAt: this.now().toISOString() };
    this.tasks.set(id, task);
    return task;
  }

  updateTask(id, patch) {
    const t = this.tasks.get(id);
    if (!t) return undefined;
    Object.assign(t, patch);
    return t;
  }

  deleteTask(id) {
    return this.tasks.delete(id);
  }
}

module.exports = { Store };
