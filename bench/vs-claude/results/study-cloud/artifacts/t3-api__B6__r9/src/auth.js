'use strict';
const { HttpError } = require('./http');

/** Đọc header X-User → user {id, role, team}; thiếu/không tồn tại → 401. */
function authenticate(store, req) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' && id ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

module.exports = { authenticate };
