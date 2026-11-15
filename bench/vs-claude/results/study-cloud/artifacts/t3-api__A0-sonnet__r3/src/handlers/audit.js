'use strict';
const { HttpError, send } = require('../http');
const { parseQuery } = require('../query');

function register(router, store) {
  router.route('GET', '/audit', ({ res, query, user }) => {
    const q = parseQuery(query, { allowed: ['taskId'] });
    if (user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Chỉ admin');
    let items = store.audit;
    if (q.taskId !== undefined) items = items.filter((e) => e.taskId === q.taskId);
    send(res, 200, { items: [...items].sort((a, b) => b.seq - a.seq) });
  });
}

module.exports = { register };
