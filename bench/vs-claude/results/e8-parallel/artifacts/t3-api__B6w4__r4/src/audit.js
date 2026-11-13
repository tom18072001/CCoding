'use strict';
const { HttpError, send } = require('./http');

class AuditLog {
  constructor(nowFn = () => new Date()) {
    this.now = nowFn;
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

  /** Mới nhất trước; lọc theo taskId nếu có. */
  list(taskId) {
    const src = taskId === undefined ? this.entries : this.entries.filter((e) => e.taskId === taskId);
    return src.map((e) => ({ ...e, changes: [...e.changes] })).reverse();
  }
}

function register(router, { store, audit, requireUser }) {
  router.route('GET', '/audit', ({ req, res, url }) => {
    const auth = requireUser || require('./auth').requireUser;
    const user = auth(store, req);
    const seen = new Set();
    for (const k of url.searchParams.keys()) {
      if (k !== 'taskId' || seen.has(k)) throw new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${k}`, { field: k });
      seen.add(k);
    }
    if (!user || user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Chỉ admin');
    const taskId = url.searchParams.get('taskId');
    send(res, 200, { items: audit.list(taskId === null ? undefined : taskId) });
  });
}

module.exports = { AuditLog, register };
