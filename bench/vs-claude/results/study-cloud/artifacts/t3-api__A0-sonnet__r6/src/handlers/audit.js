'use strict';
const { HttpError, send } = require('../http');
const { parseQuery } = require('../query');
const { authenticate } = require('./auth');

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, ['taskId']);
    if (user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    let items = store.audit;
    if (q.taskId !== undefined) items = items.filter((e) => e.taskId === q.taskId);
    send(res, 200, { items: [...items].sort((a, b) => b.seq - a.seq) });
  });
}

module.exports = { register };
