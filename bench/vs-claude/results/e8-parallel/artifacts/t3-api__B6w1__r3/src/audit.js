'use strict';
const { HttpError, send } = require('./http');

class Audit {
  constructor(now = () => new Date()) {
    this.now = now;
    this.entries = [];
    this.seq = 0;
  }

  record({ userId, action, taskId, changes = [] }) {
    const entry = {
      seq: ++this.seq,
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
    const all = taskId === undefined ? this.entries : this.entries.filter((e) => e.taskId === taskId);
    return all.slice().reverse().map((e) => ({ ...e, changes: [...e.changes] }));
  }
}

function registerAudit(router, { audit, authenticate }) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req);
    const seen = new Set();
    for (const key of query.keys()) {
      if (key !== 'taskId' || seen.has(key)) throw new HttpError(400, 'INVALID_QUERY', { field: key });
      seen.add(key);
    }
    if (!user || user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Chỉ admin');
    const taskId = query.get('taskId');
    send(res, 200, { items: audit.list(taskId === null ? undefined : taskId) });
  });
}

module.exports = { Audit, registerAudit };
