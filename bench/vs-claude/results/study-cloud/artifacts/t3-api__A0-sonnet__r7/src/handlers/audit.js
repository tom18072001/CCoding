'use strict';
const { HttpError, send } = require('../http');
const { authenticate, forbidden } = require('../auth');

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const seen = new Set();
    for (const [k] of query) {
      if (k !== 'taskId' || seen.has(k)) throw new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${k}`, { field: k });
      seen.add(k);
    }
    if (user.role !== 'admin') throw forbidden();
    let items = store.audit.slice().reverse();
    if (query.has('taskId')) items = items.filter((e) => e.taskId === query.get('taskId'));
    send(res, 200, { items });
  });
}

module.exports = { register };
