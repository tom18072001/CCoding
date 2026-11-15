'use strict';
const { HttpError, send } = require('../http');
const { authenticate, forbidden } = require('../auth');

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    for (const k of query.keys()) {
      if (k !== 'taskId' || query.getAll(k).length > 1) throw new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${k}`, { field: k });
    }
    if (user.role !== 'admin') throw forbidden();
    const taskId = query.get('taskId');
    let items = store.audit;
    if (taskId !== null) items = items.filter((e) => e.taskId === taskId);
    send(res, 200, { items: [...items].sort((a, b) => b.seq - a.seq) });
  });
}

module.exports = { register };
