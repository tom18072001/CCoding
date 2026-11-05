'use strict';
const { HttpError, send } = require('../http');
const { authenticate } = require('./tasks');

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(store, req);
    const seen = new Set();
    for (const k of query.keys()) {
      if (k !== 'taskId' || seen.has(k)) throw new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${k}`, { field: k });
      seen.add(k);
    }
    if (user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Chỉ admin được xem nhật ký');
    const taskId = query.get('taskId');
    let items = store.audit.slice().reverse();
    if (taskId !== null) items = items.filter((e) => e.taskId === taskId);
    send(res, 200, { items });
  });
}

module.exports = { register };
