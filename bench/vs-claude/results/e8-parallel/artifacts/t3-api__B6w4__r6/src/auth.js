'use strict';
const { HttpError } = require('./http');

/** Xác thực qua header X-User → user trong store; không có → 401. */
function authenticate(store, req) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

const forbidden = (msg) => new HttpError(403, 'FORBIDDEN', msg || 'Không có quyền thực hiện');

/** Member chỉ thấy nhiệm vụ nhóm mình; admin/manager thấy tất cả. */
function canRead(user, task) {
  return user.role !== 'member' || task.team === user.team;
}

/** Quyền tạo; body có thể là {} khi chỉ kiểm tra theo vai trò. */
function assertCanCreate(user, body) {
  if (user.role === 'admin') return;
  if (user.role === 'manager' && (body.team === undefined || body.team === user.team)) return;
  throw forbidden();
}

/** Quyền ở mức nhiệm vụ (trước khi đọc body). */
function assertCanModifyTask(user, task) {
  if (user.role === 'admin') return;
  if (user.role === 'manager' && task.team === user.team) return;
  if (user.role === 'member' && task.assignee === user.id) return;
  throw forbidden();
}

/** Quyền ở mức nội dung sửa (sau khi có body, trước validate). */
function assertCanPatchBody(user, body) {
  if (user.role === 'admin') return;
  if (user.role === 'manager') {
    if (body.team !== undefined && body.team !== user.team) throw forbidden();
    return;
  }
  if (Object.keys(body).some((k) => k !== 'status')) throw forbidden();
}

function assertCanDelete(user) {
  if (user.role !== 'admin') throw forbidden();
}

module.exports = { authenticate, canRead, assertCanCreate, assertCanModifyTask, assertCanPatchBody, assertCanDelete };
