'use strict';
const { HttpError, send, readJson } = require('../http');
const { parseQuery, selectTasks } = require('../query');

const STATUSES = ['todo', 'doing', 'done'];
const FIELDS = ['title', 'status', 'priority', 'assignee', 'team', 'dueDate'];
const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const EXPORT_PARAMS = LIST_PARAMS.filter((p) => p !== 'page' && p !== 'pageSize');
const CSV_COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function validate(body, store, { partial }) {
  for (const k of Object.keys(body)) if (!FIELDS.includes(k)) throw new HttpError(400, 'VALIDATION', `Trường không hợp lệ: ${k}`, { field: k });
  const need = partial ? [] : ['title', 'team'];
  for (const k of need) if (body[k] === undefined) throw new HttpError(400, 'VALIDATION', `Thiếu ${k}`, { field: k });
  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200))
    throw new HttpError(400, 'VALIDATION', 'title phải là chuỗi 1–200 ký tự', { field: 'title' });
  if (body.status !== undefined && !STATUSES.includes(body.status)) throw new HttpError(400, 'VALIDATION', 'status không hợp lệ', { field: 'status' });
  if (body.priority !== undefined && ![1, 2, 3].includes(body.priority)) throw new HttpError(400, 'VALIDATION', 'priority phải là 1, 2 hoặc 3', { field: 'priority' });
  if (body.assignee !== undefined && body.assignee !== null && !store.user(body.assignee))
    throw new HttpError(400, 'VALIDATION', 'assignee không tồn tại', { field: 'assignee' });
  if (body.team !== undefined && !['A', 'B'].includes(body.team)) throw new HttpError(400, 'VALIDATION', 'team không hợp lệ', { field: 'team' });
  if (body.dueDate !== undefined && body.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate))
    throw new HttpError(400, 'VALIDATION', 'dueDate phải dạng YYYY-MM-DD', { field: 'dueDate' });
}

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền thực hiện');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');

/** Bọc handler: xác thực qua X-User, gắn ctx.user. */
function authed(store, fn) {
  return (ctx) => {
    const id = ctx.req.headers['x-user'];
    const user = typeof id === 'string' ? store.user(id) : undefined;
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    return fn({ ...ctx, user });
  };
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[,"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function register(router, store) {
  /** Nhiệm vụ mà user được thấy, hoặc 404. */
  const visible = (user, id) => {
    const t = store.getTask(id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw notFound();
    return t;
  };

  router.route('GET', '/tasks', authed(store, ({ res, user, query }) => {
    const q = parseQuery(query, LIST_PARAMS);
    const all = selectTasks(store, user, q);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    send(res, 200, { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize });
  }));

  // Phải đăng ký trước '/tasks/:id'.
  router.route('GET', '/tasks/export.csv', authed(store, ({ res, user, query }) => {
    const q = parseQuery(query, EXPORT_PARAMS);
    const rows = selectTasks(store, user, q).map((t) => CSV_COLS.map((c) => csvCell(t[c])).join(',') + '\r\n');
    send(res, 200, '﻿' + CSV_COLS.join(',') + '\r\n' + rows.join(''), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  }));

  router.route('GET', '/tasks/:id', authed(store, ({ res, params, user }) => {
    send(res, 200, visible(user, params.id));
  }));

  router.route('POST', '/tasks', authed(store, async ({ req, res, user }) => {
    if (user.role === 'member') throw forbidden();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.log(user.id, 'create', t.id, Object.keys(body).sort());
    send(res, 201, t);
  }));

  router.route('PATCH', '/tasks/:id', authed(store, async ({ req, res, params, user }) => {
    const t = visible(user, params.id);
    if (user.role === 'member' && t.assignee !== user.id) throw forbidden();
    if (user.role === 'manager' && t.team !== user.team) throw forbidden();
    const body = await readJson(req);
    if (user.role === 'member' && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]).sort();
    const updated = store.updateTask(params.id, body);
    store.log(user.id, 'update', params.id, changes);
    send(res, 200, updated);
  }));

  router.route('DELETE', '/tasks/:id', authed(store, ({ res, params, user }) => {
    visible(user, params.id);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.log(user.id, 'delete', params.id, []);
    send(res, 204);
  }));

  router.route('GET', '/audit', authed(store, ({ res, user, query }) => {
    const q = parseQuery(query, ['taskId']);
    if (user.role !== 'admin') throw forbidden();
    const items = store.audit.filter((e) => q.taskId === undefined || e.taskId === q.taskId).reverse();
    send(res, 200, { items });
  }));
}

module.exports = { register, STATUSES, FIELDS };
