'use strict';
const { HttpError, send, readJson } = require('../http');
const { parseListQuery, parseAuditQuery, filterAndSort } = require('../query');
const { toCsv } = require('../csv');

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

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền thực hiện');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');

function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = id === undefined ? undefined : store.user(id);
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
  return user;
}

/** Nhiệm vụ mà user được phép thấy, hoặc undefined. */
function visibleTask(store, user, id) {
  const t = store.getTask(id);
  if (!t) return undefined;
  if (user.role === 'member' && t.team !== user.team) return undefined;
  return t;
}

function scopedList(store, user, q) {
  let list = store.listTasks();
  if (user.role === 'member') list = list.filter((t) => t.team === user.team);
  return filterAndSort(list, q);
}

function register(router, store) {
  const auth = (fn) => (ctx) => fn({ ...ctx, user: authenticate(ctx.req, store) });

  router.route('GET', '/tasks', auth(({ res, query, user }) => {
    const q = parseListQuery(query, { paged: true });
    const all = scopedList(store, user, q);
    const start = (q.page - 1) * q.pageSize;
    send(res, 200, { items: all.slice(start, start + q.pageSize), total: all.length, page: q.page, pageSize: q.pageSize });
  }));

  // Phải đăng ký trước '/tasks/:id'
  router.route('GET', '/tasks/export.csv', auth(({ res, query, user }) => {
    const q = parseListQuery(query, { paged: false });
    send(res, 200, toCsv(scopedList(store, user, q)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  }));

  router.route('GET', '/tasks/:id', auth(({ res, params, user }) => {
    const t = visibleTask(store, user, params.id);
    if (!t) throw notFound();
    send(res, 200, t);
  }));

  router.route('POST', '/tasks', auth(async ({ req, res, user }) => {
    if (user.role === 'member') throw forbidden();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.log(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  }));

  router.route('PATCH', '/tasks/:id', auth(async ({ req, res, params, user }) => {
    const t = visibleTask(store, user, params.id);
    if (!t) throw notFound();
    if (user.role === 'manager' && t.team !== user.team) throw forbidden();
    if (user.role === 'member' && t.assignee !== user.id) throw forbidden();
    const body = await readJson(req);
    if (user.role === 'member' && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    store.log(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  }));

  router.route('DELETE', '/tasks/:id', auth(({ res, params, user }) => {
    const t = visibleTask(store, user, params.id);
    if (!t) throw notFound();
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.log(user.id, 'delete', t.id, []);
    send(res, 204);
  }));

  router.route('GET', '/audit', auth(({ res, query, user }) => {
    const { taskId } = parseAuditQuery(query);
    if (user.role !== 'admin') throw forbidden();
    let items = [...store.audit].reverse();
    if (taskId !== undefined) items = items.filter((e) => e.taskId === taskId);
    send(res, 200, { items });
  }));
}

module.exports = { register, STATUSES, FIELDS };
