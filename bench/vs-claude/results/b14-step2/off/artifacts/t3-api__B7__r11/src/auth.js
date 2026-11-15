'use strict';
const { HttpError } = require('./http');

/** Xác thực qua header X-User; trả về user hoặc ném 401. */
function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

const forbidden = (msg = 'Không đủ quyền') => new HttpError(403, 'FORBIDDEN', msg);

module.exports = { authenticate, forbidden };
