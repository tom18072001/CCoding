'use strict';
const { HttpError, send, readJson } = require('../http');
const { parseQuery, applyQuery } = require('../query');
const { toCsv } = require('../csv');
const { AuditLog } = require('../audit');

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

function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = id ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');

function parseListQuery(searchParams, allowPaging) {
  const r = parseQuery(searchParams, { allowPaging });
  if (!r.ok) throw new HttpError(400, 'INVALID_QUERY', 'Tham số truy vấn không hợp lệ', { field: r.field });
  return r.query;
}

function visibleTasks(store, user) {
  const all = store.listTasks();
  return user.role === 'member' ? all.filter((t) => t.team === user.team) : all;
}

function findVisible(store, user, id) {
  const t = store.getTask(id);
  if (!t || (user.role === 'member' && t.team !== user.team)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
  return t;
}

function register(router, store) {
  const audit = (store.audit = new AuditLog(store.now));
  const guarded = (fn) => (ctx) => fn({ ...ctx, user: authenticate(ctx.req, store) });

  router.route('GET', '/audit', guarded(({ res, query, user }) => {
    for (const k of query.keys()) if (k !== 'taskId') throw new HttpError(400, 'INVALID_QUERY', 'Tham số không hợp lệ', { field: k });
    if (query.getAll('taskId').length > 1) throw new HttpError(400, 'INVALID_QUERY', 'Tham số lặp', { field: 'taskId' });
    if (user.role !== 'admin') throw forbidden();
    const taskId = query.get('taskId');
    send(res, 200, { items: audit.list(taskId === null ? {} : { taskId }) });
  }));

  router.route('GET', '/tasks', guarded(({ res, query, user }) => {
    const q = parseListQuery(query, true);
    send(res, 200, applyQuery(visibleTasks(store, user), q));
  }));

  // Phải đăng ký trước /tasks/:id
  router.route('GET', '/tasks/export.csv', guarded(({ res, query, user }) => {
    const q = parseListQuery(query, false);
    const { items } = applyQuery(visibleTasks(store, user), q);
    send(res, 200, toCsv(items), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  }));

  router.route('GET', '/tasks/:id', guarded(({ res, params, user }) => {
    send(res, 200, findVisible(store, user, params.id));
  }));

  router.route('POST', '/tasks', guarded(async ({ req, res, user }) => {
    if (user.role === 'member') throw forbidden();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    audit.record({ userId: user.id, action: 'create', taskId: t.id, changes: Object.keys(body).sort() });
    send(res, 201, t);
  }));

  router.route('PATCH', '/tasks/:id', guarded(async ({ req, res, params, user }) => {
    const t = findVisible(store, user, params.id);
    if (user.role === 'manager' && t.team !== user.team) throw forbidden();
    if (user.role === 'member' && t.assignee !== user.id) throw forbidden();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (user.role === 'member' && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]).sort();
    const updated = store.updateTask(params.id, body);
    audit.record({ userId: user.id, action: 'update', taskId: params.id, changes });
    send(res, 200, updated);
  }));

  router.route('DELETE', '/tasks/:id', guarded(({ res, params, user }) => {
    findVisible(store, user, params.id);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    audit.record({ userId: user.id, action: 'delete', taskId: params.id, changes: [] });
    send(res, 204);
  }));
}

module.exports = { register, STATUSES, FIELDS };
