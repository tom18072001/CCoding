'use strict';
const { HttpError } = require('./http');

/** Xác thực qua header X-User; trả về user hoặc ném 401. */
function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

function forbidden(msg) {
  return new HttpError(403, 'FORBIDDEN', msg || 'Không có quyền thực hiện');
}

/** Member chỉ thấy nhiệm vụ nhóm mình. */
function canRead(user, task) {
  return user.role !== 'member' || task.team === user.team;
}

module.exports = { authenticate, forbidden, canRead };
