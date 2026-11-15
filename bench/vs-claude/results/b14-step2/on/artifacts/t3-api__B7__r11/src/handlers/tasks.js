'use strict';
const { HttpError, send, readJson } = require('../http');
const { parseQuery, select } = require('./query');
const { toCsv } = require('./csv');

const STATUSES = ['todo', 'doing', 'done'];
const FIELDS = ['title', 'status', 'priority', 'assignee', 'team', 'dueDate'];

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

const forbid = (msg = 'Không đủ quyền') => new HttpError(403, 'FORBIDDEN', msg);

/** Đọc body; lỗi JSON được hoãn tới bước validate (sau kiểm tra quyền). */
async function readBody(req) {
  try {
    return { body: await readJson(req) };
  } catch (e) {
    return { body: {}, deferred: e };
  }
}

function register(router, store) {
  const findVisible = (user, id) => {
    const t = store.getTask(id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    return t;
  };

  // export.csv phải đăng ký trước /tasks/:id
  router.route('GET', '/tasks/export.csv', ({ res, query, user }) => {
    const f = parseQuery(query, { paged: false });
    send(res, 200, toCsv(select(store, f, user)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks', ({ res, query, user }) => {
    const f = parseQuery(query, { paged: true });
    const all = select(store, f, user);
    const start = (f.page - 1) * f.pageSize;
    send(res, 200, { items: all.slice(start, start + f.pageSize), total: all.length, page: f.page, pageSize: f.pageSize });
  });

  router.route('GET', '/tasks/:id', ({ res, params, user }) => {
    send(res, 200, findVisible(user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res, user }) => {
    if (user.role === 'member') throw forbid();
    const { body, deferred } = await readBody(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbid();
    if (deferred) throw deferred;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.audit(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params, user }) => {
    const t = findVisible(user, params.id);
    const { body, deferred } = await readBody(req);
    if (user.role === 'manager') {
      if (t.team !== user.team) throw forbid();
      if (body.team !== undefined && body.team !== user.team) throw forbid();
    } else if (user.role === 'member') {
      if (t.assignee !== user.id || Object.keys(body).some((k) => k !== 'status')) throw forbid();
    }
    if (deferred) throw deferred;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    store.audit(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ res, params, user }) => {
    const t = findVisible(user, params.id);
    if (user.role !== 'admin') throw forbid();
    store.deleteTask(t.id);
    store.audit(user.id, 'delete', t.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
