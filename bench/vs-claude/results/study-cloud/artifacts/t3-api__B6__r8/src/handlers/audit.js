'use strict';
const { HttpError, send } = require('../http');
const { authenticate, forbidden } = require('../auth');

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    for (const k of new Set(query.keys())) {
      if (k !== 'taskId') throw new HttpError(400, 'INVALID_QUERY', `Tham số không hỗ trợ: ${k}`, { field: k });
    }
    if (query.getAll('taskId').length > 1) throw new HttpError(400, 'INVALID_QUERY', 'taskId lặp', { field: 'taskId' });
    if (user.role !== 'admin') throw forbidden();
    let items = [...store.audit].sort((a, b) => b.seq - a.seq);
    if (query.has('taskId')) items = items.filter((e) => e.taskId === query.get('taskId'));
    send(res, 200, { items });
  });
}

module.exports = { register };
