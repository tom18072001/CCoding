'use strict';
const { HttpError } = require('./http');

function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = id ? store.user(String(id)) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Cần header X-User hợp lệ');
  return user;
}

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');

function canSee(user, task) {
  return user.role !== 'member' || task.team === user.team;
}

module.exports = { authenticate, forbidden, notFound, canSee };
