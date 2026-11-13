'use strict';
const { HttpError } = require('./http');

/** Xác thực qua header X-User; ném 401 nếu thiếu/không tồn tại. */
function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

function forbidden(msg = 'Không đủ quyền') {
  return new HttpError(403, 'FORBIDDEN', msg);
}

module.exports = { authenticate, forbidden };
