'use strict';
const { HttpError, send } = require('../http');
const { parseQuery } = require('./query');

function register(router, store) {
  router.route('GET', '/audit', ({ res, query, user }) => {
    const q = parseQuery(query, ['taskId']);
    if (user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    let items = [...store.audit].reverse();
    if (q.taskId !== undefined) items = items.filter((e) => e.taskId === q.taskId);
    send(res, 200, { items });
  });
}

module.exports = { register };
