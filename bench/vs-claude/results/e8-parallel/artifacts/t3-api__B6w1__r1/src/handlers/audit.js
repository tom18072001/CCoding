'use strict';
const { HttpError, send } = require('../http');

function register(router, store, auth) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = req.user || auth.authenticate(store, req); // 401
    const seen = new Set();
    for (const k of query.keys()) {
      if (k !== 'taskId' || seen.has(k)) throw new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${k}`, { field: k });
      seen.add(k);
    }
    if (user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
    const taskId = query.get('taskId');
    send(res, 200, { items: store.audit.list(taskId === null ? {} : { taskId }) });
  });
}

module.exports = { register };
