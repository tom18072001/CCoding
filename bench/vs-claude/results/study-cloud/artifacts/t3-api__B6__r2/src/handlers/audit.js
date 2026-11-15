'use strict';
const { HttpError, send } = require('../http');

/** Xác thực X-User → user, hoặc ném 401. */
function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const seen = new Set();
    for (const k of query.keys()) {
      if (k !== 'taskId' || seen.has(k)) throw new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${k}`, { field: k });
      seen.add(k);
    }
    if (user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Chỉ admin được xem nhật ký');
    const taskId = query.get('taskId');
    let items = store.audit;
    if (taskId !== null) items = items.filter((e) => e.taskId === taskId);
    send(res, 200, { items: [...items].sort((a, b) => b.seq - a.seq) });
  });
}

module.exports = { register, authenticate };
