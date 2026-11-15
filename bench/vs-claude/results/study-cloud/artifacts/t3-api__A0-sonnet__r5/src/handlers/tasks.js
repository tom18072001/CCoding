'use strict';
const { HttpError, send, readJson } = require('../http');
const { authenticate, forbidden } = require('../auth');
const { parseQuery, applyFilters, applySort } = require('../query');
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

const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const EXPORT_PARAMS = LIST_PARAMS.filter((p) => p !== 'page' && p !== 'pageSize');

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
const canSee = (user, t) => user.role !== 'member' || t.team === user.team;

/** Tìm nhiệm vụ; member không thấy nhiệm vụ nhóm khác → 404. */
function findVisible(store, user, id) {
  const t = store.getTask(id);
  if (!t || !canSee(user, t)) throw notFound();
  return t;
}

/** Đọc body nhưng hoãn lỗi JSON để đúng thứ tự kiểm tra (403 trước 400). */
async function readBody(req) {
  try {
    return { body: await readJson(req) };
  } catch (err) {
    if (err instanceof HttpError) return { error: err };
    throw err;
  }
}

function filtered(store, user, query, allowed) {
  const q = parseQuery(query, allowed);
  let tasks = store.listTasks();
  if (user.role === 'member') tasks = tasks.filter((t) => t.team === user.team);
  return { q, tasks: applySort(applyFilters(tasks, q), q.sort) };
}

function register(router, store) {
  // export.csv phải đăng ký trước /tasks/:id
  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const { tasks } = filtered(store, user, query, EXPORT_PARAMS);
    send(res, 200, toCsv(tasks), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const { q, tasks } = filtered(store, user, query, LIST_PARAMS);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    send(res, 200, { items: tasks.slice(start, start + pageSize), total: tasks.length, page, pageSize });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    send(res, 200, findVisible(store, user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    const parsed = await readBody(req);
    if (user.role === 'member') throw forbidden();
    if (parsed.error) throw parsed.error;
    const body = parsed.body;
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: false });
    const at = store.now().toISOString();
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body }, at);
    store.record(user.id, 'create', t.id, Object.keys(body), at);
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = findVisible(store, user, params.id);
    const parsed = await readBody(req);
    const keys = parsed.body ? Object.keys(parsed.body) : [];
    if (user.role === 'manager') {
      if (t.team !== user.team) throw forbidden();
      if (parsed.body && parsed.body.team !== undefined && parsed.body.team !== user.team) throw forbidden();
    } else if (user.role === 'member') {
      if (t.assignee !== user.id || keys.some((k) => k !== 'status')) throw forbidden();
    }
    if (parsed.error) throw parsed.error;
    const body = parsed.body;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const at = store.now().toISOString();
    const updated = store.updateTask(params.id, body);
    store.record(user.id, 'update', t.id, changes, at);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = findVisible(store, user, params.id);
    if (user.role !== 'admin') throw forbidden();
    const at = store.now().toISOString();
    store.deleteTask(t.id);
    store.record(user.id, 'delete', t.id, [], at);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
