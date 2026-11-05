'use strict';
const { HttpError } = require('./http');

function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Cần đăng nhập (header X-User)');
  return user;
}

function forbidden(message = 'Không đủ quyền') {
  return new HttpError(403, 'FORBIDDEN', message);
}

module.exports = { authenticate, forbidden };
