'use strict';
const { HttpError, send } = require('../http');
const { forbidden } = require('../auth');

function register(router, store) {
  router.route('GET', '/audit', ({ res, query, user }) => {
    let taskId = null;
    const seen = new Set();
    for (const [k, v] of query.entries()) {
      if (k !== 'taskId' || seen.has(k)) throw new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${k}`, { field: k });
      seen.add(k);
      taskId = v;
    }
    if (user.role !== 'admin') throw forbidden();
    let items = store.audit.slice();
    if (taskId !== null) items = items.filter((e) => e.taskId === taskId);
    items.sort((a, b) => b.seq - a.seq);
    send(res, 200, { items });
  });
}

module.exports = { register };
