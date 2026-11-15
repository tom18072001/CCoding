'use strict';
const { HttpError } = require('./http');

/** Đọc header X-User → { id, role, team }; thiếu/không tồn tại → 401. */
function authenticate(req, store) {
  const id = req.headers['x-user'];
  const u = typeof id === 'string' ? store.user(id) : undefined;
  if (!u) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return { id: u.id, role: u.role, team: u.team ?? null };
}

function canRead(user, task) {
  return user.role !== 'member' || task.team === user.team;
}

function visibleTasks(user, tasks) {
  return tasks.filter((t) => canRead(user, t));
}

function forbidden() {
  return new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
}

module.exports = { authenticate, canRead, visibleTasks, forbidden };
