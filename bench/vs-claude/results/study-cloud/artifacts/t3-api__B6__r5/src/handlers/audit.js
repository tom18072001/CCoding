'use strict';
const { HttpError, send } = require('../http');

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    let taskId;
    let seen = false;
    for (const [k, v] of query.entries()) {
      if (k !== 'taskId' || seen) throw new HttpError(400, 'INVALID_QUERY', 'Tham số truy vấn không hợp lệ', { field: k });
      seen = true;
      taskId = v;
    }
    if (req.user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    let items = store.listAudit();
    if (taskId !== undefined) items = items.filter((e) => e.taskId === taskId);
    send(res, 200, { items });
  });
}

module.exports = { register };
