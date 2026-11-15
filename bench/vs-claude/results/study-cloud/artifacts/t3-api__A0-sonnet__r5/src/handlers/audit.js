'use strict';
const { send } = require('../http');
const { authenticate, forbidden } = require('../auth');
const { parseQuery } = require('../query');

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, ['taskId']);
    if (user.role !== 'admin') throw forbidden();
    let items = store.audit;
    if (q.taskId !== undefined) items = items.filter((e) => e.taskId === q.taskId);
    send(res, 200, { items: items.map((e) => ({ ...e, changes: [...e.changes] })).sort((a, b) => b.seq - a.seq) });
  });
}

module.exports = { register };
