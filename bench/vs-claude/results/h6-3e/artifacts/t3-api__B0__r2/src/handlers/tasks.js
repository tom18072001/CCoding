'use strict';
const { HttpError, send, readJson } = require('../http');
const { auth, parseQuery, filterSort, toCsv } = require('../query');

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

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');

/** Nhiệm vụ user được phép thấy, hoặc 404. */
function readable(user, t) {
  if (!t || (user.role === 'member' && t.team !== user.team)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
  return t;
}

function register(router, store) {
  const A = (fn) => (ctx) => fn({ ...ctx, user: auth(store, ctx.req) });

  router.route('GET', '/tasks', A(({ res, query, user }) => {
    const q = parseQuery(query, { paged: true });
    const all = filterSort(store.listTasks(), q, user);
    const start = (q.page - 1) * q.pageSize;
    send(res, 200, { items: all.slice(start, start + q.pageSize), total: all.length, page: q.page, pageSize: q.pageSize });
  }));

  router.route('GET', '/tasks/export.csv', A(({ res, query, user }) => {
    const q = parseQuery(query, { paged: false });
    send(res, 200, toCsv(filterSort(store.listTasks(), q, user)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  }));

  router.route('GET', '/audit', A(({ res, query, user }) => {
    const q = parseQuery(query, { audit: true });
    if (user.role !== 'admin') throw forbidden();
    let items = store.audit.slice().reverse();
    if (q.taskId !== undefined) items = items.filter((e) => e.taskId === q.taskId);
    send(res, 200, { items });
  }));

  router.route('GET', '/tasks/:id', A(({ res, params, query, user }) => {
    send(res, 200, readable(user, store.getTask(params.id)));
  }));

  router.route('POST', '/tasks', A(async ({ req, res, query, user }) => {
    if (user.role === 'member') throw forbidden();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.log(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  }));

  router.route('PATCH', '/tasks/:id', A(async ({ req, res, params, query, user }) => {
    const t = readable(user, store.getTask(params.id));
    if (user.role === 'manager' && t.team !== user.team) throw forbidden();
    if (user.role === 'member' && t.assignee !== user.id) throw forbidden();
    const body = await readJson(req);
    if (user.role === 'member' && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const upd = store.updateTask(params.id, body);
    store.log(user.id, 'update', t.id, changes);
    send(res, 200, upd);
  }));

  router.route('DELETE', '/tasks/:id', A(({ res, params, query, user }) => {
    readable(user, store.getTask(params.id));
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.log(user.id, 'delete', params.id, []);
    send(res, 204);
  }));
}

module.exports = { register, STATUSES, FIELDS };
