'use strict';
const { HttpError } = require('./http');

/** Trả về người dùng từ header X-User, hoặc ném 401 UNAUTHENTICATED. */
function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền thực hiện');

module.exports = { authenticate, forbidden };
