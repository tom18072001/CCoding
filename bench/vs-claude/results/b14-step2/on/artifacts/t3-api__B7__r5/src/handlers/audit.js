'use strict';
const { HttpError, send } = require('../http');
const { authenticate, forbidden } = require('../auth');

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    let taskId;
    const seen = new Set();
    for (const [k, v] of query.entries()) {
      if (k !== 'taskId' || seen.has(k)) throw new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${k}`, { field: k });
      seen.add(k);
      taskId = v;
    }
    if (user.role !== 'admin') throw forbidden();
    let items = [...store.audit].reverse();
    if (taskId !== undefined) items = items.filter((e) => e.taskId === taskId);
    send(res, 200, { items });
  });
}

module.exports = { register };
