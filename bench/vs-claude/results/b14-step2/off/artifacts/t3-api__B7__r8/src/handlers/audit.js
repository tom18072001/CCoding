'use strict';
const { HttpError, send } = require('../http');
const { authenticate } = require('./auth');
const { bad } = require('./query');

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    let taskId;
    const seen = new Set();
    for (const [k, v] of query.entries()) {
      if (k !== 'taskId' || seen.has(k)) throw bad(k);
      seen.add(k);
      taskId = v;
    }
    if (user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
    let items = store.audit.slice().sort((a, b) => b.seq - a.seq);
    if (taskId !== undefined) items = items.filter((e) => e.taskId === taskId);
    send(res, 200, { items });
  });
}

module.exports = { register };
