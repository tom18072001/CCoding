'use strict';
const { send } = require('../http');
const { parseQuery } = require('../query');
const { authenticate, forbidden } = require('../auth');

class AuditLog {
  constructor(now) {
    this.now = now;
    this.items = [];
  }

  add(user, action, taskId, changes) {
    this.items.push({ seq: this.items.length + 1, at: this.now().toISOString(), userId: user.id, action, taskId, changes: [...changes].sort() });
  }
}

function register(router, store, audit) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, ['taskId']);
    if (user.role !== 'admin') throw forbidden();
    const items = audit.items.filter((e) => !q.taskId || e.taskId === q.taskId).slice().reverse();
    send(res, 200, { items });
  });
}

module.exports = { AuditLog, register };
