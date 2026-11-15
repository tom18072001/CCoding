'use strict';
const { HttpError, send, readJson } = require('../http');
const { authenticate, parseQuery, filterAndSort, toCsv } = require('./helpers');

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

/** Đọc body nhưng hoãn lỗi JSON tới bước validate (sau các kiểm tra quyền). */
async function readBody(req) {
  try {
    return { body: await readJson(req), err: null };
  } catch (err) {
    return { body: {}, err };
  }
}

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền thực hiện');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
const canSee = (user, t) => user.role !== 'member' || t.team === user.team;

const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const EXPORT_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

function register(router, store) {
  // Đăng ký export.csv trước /tasks/:id để không bị nuốt.
  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, EXPORT_PARAMS);
    const items = filterAndSort(store.listTasks(), q, user);
    send(res, 200, toCsv(items), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, LIST_PARAMS);
    const all = filterAndSort(store.listTasks(), q, user);
    const start = (q.page - 1) * q.pageSize;
    send(res, 200, { items: all.slice(start, start + q.pageSize), total: all.length, page: q.page, pageSize: q.pageSize });
  });

  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, ['taskId'], { audit: true });
    if (user.role !== 'admin') throw forbidden();
    let items = store.auditLog;
    if (q.taskId !== undefined) items = items.filter((e) => e.taskId === q.taskId);
    send(res, 200, { items: [...items].sort((a, b) => b.seq - a.seq) });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || !canSee(user, t)) throw notFound();
    send(res, 200, t);
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    const { body, err } = await readBody(req);
    if (user.role === 'member') throw forbidden();
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (err) throw err;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.addAudit(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || !canSee(user, t)) throw notFound();
    const { body, err } = await readBody(req);
    if (user.role === 'manager') {
      if (t.team !== user.team) throw forbidden();
      if (body.team !== undefined && body.team !== user.team) throw forbidden();
    } else if (user.role === 'member') {
      if (t.assignee !== user.id || Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    }
    if (err) throw err;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    store.addAudit(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || !canSee(user, t)) throw notFound();
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.addAudit(user.id, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
