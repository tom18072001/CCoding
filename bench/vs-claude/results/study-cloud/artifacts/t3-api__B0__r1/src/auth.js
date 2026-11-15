'use strict';
const { HttpError } = require('./http');

/** Đọc header x-user → user trong store; thiếu/không tồn tại → 401 UNAUTHENTICATED. */
function getUser(req, store) {
  const id = req.headers['x-user'];
  const user = id ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

/** member chỉ thấy task cùng nhóm; vai trò khác thấy hết. */
function canSee(user, task) {
  return user.role !== 'member' || task.team === user.team;
}

/** Nhóm cần ép lọc (member) hoặc null. */
function teamScope(user) {
  return user.role === 'member' ? user.team : null;
}

function forbidden() {
  return new HttpError(403, 'FORBIDDEN', 'Không có quyền thực hiện');
}

module.exports = { getUser, canSee, teamScope, forbidden };
