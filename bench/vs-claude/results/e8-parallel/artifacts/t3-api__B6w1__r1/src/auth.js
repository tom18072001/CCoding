'use strict';
const { HttpError } = require('./http');

function forbidden(msg = 'Không đủ quyền') {
  return new HttpError(403, 'FORBIDDEN', msg);
}

/** Xác thực qua header X-User; trả về user hoặc ném 401. */
function authenticate(store, req) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

/** Member chỉ thấy nhiệm vụ nhóm mình; admin/manager thấy tất cả. */
function canRead(user, task) {
  return user.role !== 'member' || task.team === user.team;
}

function requireAdmin(user) {
  if (user.role !== 'admin') throw forbidden();
}

function requireCanDelete(user) {
  requireAdmin(user);
}

/** Kiểm tra quyền tạo (cần body để biết team). */
function requireCanCreate(user, body) {
  if (user.role === 'admin') return;
  if (user.role === 'manager' && (body.team === undefined || body.team === user.team)) return;
  throw forbidden();
}

/** Kiểm tra quyền sửa task (đã qua kiểm tra đọc) với body. */
function requireCanUpdate(user, task, body) {
  if (user.role === 'admin') return;
  if (user.role === 'manager') {
    if (task.team !== user.team) throw forbidden();
    if (body.team !== undefined && body.team !== user.team) throw forbidden();
    return;
  }
  if (task.assignee !== user.id) throw forbidden();
  if (Object.keys(body).some((k) => k !== 'status')) throw forbidden();
}

module.exports = { authenticate, canRead, requireAdmin, requireCanDelete, requireCanCreate, requireCanUpdate };
