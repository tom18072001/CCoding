'use strict';
const { HttpError, send } = require('../http');
const { authenticate } = require('../auth');

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(store, req); // 401
    const seen = new Set();
    for (const key of query.keys()) {
      if (key !== 'taskId' || seen.has(key)) throw new HttpError(400, 'INVALID_QUERY', `Tham số truy vấn không hợp lệ: ${key}`, { field: key });
      seen.add(key);
    }
    if (user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Chỉ admin được xem nhật ký');
    const taskId = query.get('taskId');
    send(res, 200, { items: store.audit.list(taskId === null ? {} : { taskId }) });
  });
}

module.exports = { register };
