'use strict';
const { HttpError, send, readJson } = require('../http');
const { parseTaskQuery, filterSort } = require('../query');
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

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');

function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

/** Đọc body nhưng hoãn lỗi JSON để kiểm tra quyền (403) chạy trước validate (400). */
async function readBody(req) {
  try {
    return { body: await readJson(req) };
  } catch (err) {
    return { body: {}, error: err };
  }
}

/** Member chỉ thấy nhiệm vụ của nhóm mình. */
const visible = (user, task) => user.role !== 'member' || task.team === user.team;

function register(router, store) {
  const auth = (fn) => (ctx) => fn({ ...ctx, user: authenticate(ctx.req, store) });
  const listFor = (user, q) => filterSort(store.listTasks().filter((t) => visible(user, t)), q);

  router.route('GET', '/tasks/export.csv', auth(({ res, query, user }) => {
    const q = parseTaskQuery(query, { paged: false });
    send(res, 200, toCsv(listFor(user, q)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  }));

  router.route('GET', '/tasks', auth(({ res, query, user }) => {
    const q = parseTaskQuery(query, { paged: true });
    const all = listFor(user, q);
    const start = (q.page - 1) * q.pageSize;
    send(res, 200, { items: all.slice(start, start + q.pageSize), total: all.length, page: q.page, pageSize: q.pageSize });
  }));

  router.route('GET', '/audit', auth(({ res, query, user }) => {
    const seen = new Set();
    for (const k of query.keys()) {
      if (k !== 'taskId' || seen.has(k)) throw new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${k}`, { field: k });
      seen.add(k);
    }
    if (user.role !== 'admin') throw forbidden();
    const taskId = query.get('taskId');
    const items = store.audit.filter((e) => taskId === null || e.taskId === taskId).sort((a, b) => b.seq - a.seq);
    send(res, 200, { items });
  }));

  router.route('GET', '/tasks/:id', auth(({ res, params, user }) => {
    const t = store.getTask(params.id);
    if (!t || !visible(user, t)) throw notFound();
    send(res, 200, t);
  }));

  router.route('POST', '/tasks', auth(async ({ req, res, user }) => {
    if (user.role === 'member') throw forbidden();
    const { body, error } = await readBody(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (error) throw error;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.logAudit(user.id, 'create', t.id, Object.keys(body).sort());
    send(res, 201, t);
  }));

  router.route('PATCH', '/tasks/:id', auth(async ({ req, res, params, user }) => {
    const t = store.getTask(params.id);
    if (!t || !visible(user, t)) throw notFound();
    const { body, error } = await readBody(req);
    if (user.role === 'manager') {
      if (t.team !== user.team) throw forbidden();
      if (body.team !== undefined && body.team !== user.team) throw forbidden();
    } else if (user.role === 'member') {
      if (t.assignee !== user.id || Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    }
    if (error) throw error;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]).sort();
    const updated = store.updateTask(params.id, body);
    store.logAudit(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  }));

  router.route('DELETE', '/tasks/:id', auth(({ res, params, user }) => {
    const t = store.getTask(params.id);
    if (!t || !visible(user, t)) throw notFound();
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.logAudit(user.id, 'delete', t.id, []);
    send(res, 204);
  }));
}

module.exports = { register, STATUSES, FIELDS };
