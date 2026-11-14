'use strict';
const { HttpError } = require('./http');

function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = id ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
  return user;
}

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền');

module.exports = { authenticate, forbidden };
