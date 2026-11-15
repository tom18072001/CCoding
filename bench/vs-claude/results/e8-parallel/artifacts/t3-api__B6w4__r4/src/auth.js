'use strict';
const { HttpError } = require('./http');

/** Đọc header X-User → user trong store; thiếu/không tồn tại → 401. */
function requireUser(store, req) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

function forbid() {
  return new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
}

module.exports = { requireUser, forbid };
