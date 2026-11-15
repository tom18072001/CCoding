'use strict';
const { HttpError } = require('./http');

/** Xác thực theo header X-User; trả về user trong store hoặc ném 401. */
function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

function forbidden(message = 'Không có quyền') {
  return new HttpError(403, 'FORBIDDEN', message);
}

module.exports = { authenticate, forbidden };
