'use strict';
const { send } = require('../http');
const { authenticate, forbidden } = require('../auth');
const { parseQuery } = require('../query');

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, ['taskId']);
    if (user.role !== 'admin') throw forbidden();
    let items = store.audit.filter((e) => q.taskId === undefined || e.taskId === q.taskId);
    items = items.slice().sort((a, b) => b.seq - a.seq);
    send(res, 200, { items });
  });
}

module.exports = { register };
