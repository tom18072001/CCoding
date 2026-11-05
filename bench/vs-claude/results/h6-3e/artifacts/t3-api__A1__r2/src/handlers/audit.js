'use strict';
const { HttpError, send } = require('../http');
const { parseQuery } = require('../query');

function register(router, store) {
  router.route('GET', '/audit', ({ res, query, user }) => {
    const q = parseQuery(query, ['taskId']);
    if (user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Chỉ admin được xem nhật ký');
    let items = store.audit;
    if (q.taskId !== undefined) items = items.filter((e) => e.taskId === q.taskId);
    send(res, 200, { items: items.map((e) => ({ ...e, changes: [...e.changes] })).sort((a, b) => b.seq - a.seq) });
  });
}

module.exports = { register };
