'use strict';
const { send } = require('../http');
const { authenticate, forbidden, parseQuery } = require('../auth');

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, { taskId: (v) => ({ ok: true, value: v }) });
    if (user.role !== 'admin') throw forbidden();
    let items = [...store.audit].sort((a, b) => b.seq - a.seq);
    if (q.taskId !== undefined) items = items.filter((e) => e.taskId === q.taskId);
    send(res, 200, { items });
  });
}

module.exports = { register };
