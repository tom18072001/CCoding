'use strict';
const { HttpError, send } = require('../http');
const { getUser, forbidden } = require('../auth');

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = getUser(req, store);
    const seen = new Set();
    for (const k of query.keys()) {
      if (k !== 'taskId' || seen.has(k)) throw new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${k}`, { field: k });
      seen.add(k);
    }
    if (user.role !== 'admin') throw forbidden();
    const taskId = query.get('taskId');
    const items = store.audit.filter((e) => taskId === null || e.taskId === taskId).sort((a, b) => b.seq - a.seq);
    send(res, 200, { items });
  });
}

module.exports = { register };
