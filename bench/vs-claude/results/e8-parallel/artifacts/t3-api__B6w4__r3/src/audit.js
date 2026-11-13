'use strict';
const { HttpError, send } = require('./http');
const { authenticate, forbidden } = require('./auth');

/** Ghi một mục nhật ký (gọi sau khi thao tác thành công). */
function record(store, user, action, taskId, changes) {
  const entry = { seq: store.audit.length + 1, at: store.now().toISOString(), userId: user.id, action, taskId, changes: [...changes].sort() };
  store.audit.push(entry);
  return entry;
}

function register(router, store) {
  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    for (const k of query.keys()) if (k !== 'taskId') throw new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${k}`, { field: k });
    if (query.getAll('taskId').length > 1) throw new HttpError(400, 'INVALID_QUERY', 'taskId lặp', { field: 'taskId' });
    if (user.role !== 'admin') throw forbidden();
    const taskId = query.get('taskId');
    let items = store.audit.slice();
    if (taskId !== null) items = items.filter((e) => e.taskId === taskId);
    items.sort((a, b) => b.seq - a.seq);
    send(res, 200, { items });
  });
}

module.exports = { record, register };
