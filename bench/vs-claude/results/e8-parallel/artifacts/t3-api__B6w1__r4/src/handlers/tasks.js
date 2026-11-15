'use strict';
const { HttpError, send, readJson } = require('../http');
const { parseTaskQuery, runQuery } = require('../query');
const { toCsv } = require('../csv');
const { diffChanges } = require('../audit');

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

const forbid = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền thực hiện thao tác này');

/** Xác thực qua header X-User. */
function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

/** Lọc theo quyền đọc rồi chạy truy vấn. */
function listFor(store, user, parsed, opts) {
  let all = store.listTasks();
  if (user.role === 'member') all = all.filter((t) => t.team === user.team);
  return runQuery(all, parsed, opts);
}

function readable(store, user, id) {
  const t = store.getTask(id);
  if (!t || (user.role === 'member' && t.team !== user.team)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
  return t;
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const parsed = parseTaskQuery(query, { allowPaging: true });
    send(res, 200, listFor(store, user, parsed, { paginate: true }));
  });

  // Phải đăng ký trước /tasks/:id
  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const parsed = parseTaskQuery(query, { allowPaging: false });
    const { items } = listFor(store, user, parsed, { paginate: false });
    send(res, 200, toCsv(items), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    send(res, 200, readable(store, user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    if (user.role === 'member') throw forbid();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbid();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.audit.record({ userId: user.id, action: 'create', taskId: t.id, changes: Object.keys(body).sort() });
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = readable(store, user, params.id);
    const body = await readJson(req);
    if (user.role === 'manager') {
      if (t.team !== user.team) throw forbid();
      if (body.team !== undefined && body.team !== user.team) throw forbid();
    } else if (user.role === 'member') {
      if (t.assignee !== user.id || Object.keys(body).some((k) => k !== 'status')) throw forbid();
    }
    validate(body, store, { partial: true });
    const changes = diffChanges(t, body);
    const updated = store.updateTask(params.id, body);
    store.audit.record({ userId: user.id, action: 'update', taskId: params.id, changes });
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    readable(store, user, params.id);
    if (user.role !== 'admin') throw forbid();
    store.deleteTask(params.id);
    store.audit.record({ userId: user.id, action: 'delete', taskId: params.id, changes: [] });
    send(res, 204);
  });
}

module.exports = { register, authenticate, forbid, STATUSES, FIELDS };
