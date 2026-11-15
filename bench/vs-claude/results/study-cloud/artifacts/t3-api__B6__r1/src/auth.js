'use strict';
const { HttpError } = require('./http');

/** Đọc X-User → người dùng trong seed; thiếu/không có → 401. */
function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

function forbidden(msg = 'Không đủ quyền') {
  return new HttpError(403, 'FORBIDDEN', msg);
}

function notFound() {
  return new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
}

/** Member không thấy nhiệm vụ nhóm khác → 404. */
function assertCanRead(user, task) {
  if (!task) throw notFound();
  if (user.role === 'member' && task.team !== user.team) throw notFound();
}

/** Quyền theo nhiệm vụ, trước khi đọc body. */
function assertCanModifyTask(user, task) {
  if (user.role === 'admin') return;
  if (user.role === 'manager') {
    if (task.team !== user.team) throw forbidden();
    return;
  }
  if (task.assignee !== user.id) throw forbidden();
}

/** Quyền theo nội dung body của PATCH. */
function assertCanPatchBody(user, body) {
  if (user.role === 'manager') {
    if (body.team !== undefined && body.team !== user.team) throw forbidden('Không được chuyển nhóm');
  } else if (user.role === 'member') {
    const keys = Object.keys(body);
    if (keys.length !== 1 || keys[0] !== 'status') throw forbidden('Chỉ được sửa status');
  }
}

module.exports = { authenticate, forbidden, assertCanRead, assertCanModifyTask, assertCanPatchBody };
