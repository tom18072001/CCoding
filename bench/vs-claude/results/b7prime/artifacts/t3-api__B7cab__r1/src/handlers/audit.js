'use strict';
const { send } = require('../http');
const { authenticate, forbidden } = require('../auth');
const { parseAuditQuery } = require('../query');

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseAuditQuery(query);
    if (user.role !== 'admin') throw forbidden();
    const items = store.audit.filter((e) => q.taskId === undefined || e.taskId === q.taskId).sort((a, b) => b.seq - a.seq);
    send(res, 200, { items });
  });
}

module.exports = { register };
