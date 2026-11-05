'use strict';
const { HttpError, send, readJson } = require('../http');

const { authenticate, forbidden } = require('../auth');
const { parseQuery, selectTasks } = require('../query');
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

/** Đọc body nhưng hoãn lỗi JSON để kiểm tra quyền (403) chạy trước validate (400). */
async function readBodyLazy(req) {
  try {
    return { body: await readJson(req) };
  } catch (err) {
    return { body: {}, error: err };
  }
}

/** Nhiệm vụ mà user được thấy, hoặc 404. */
function visibleTask(store, user, id) {
  const t = store.getTask(id);
  if (!t || (user.role === 'member' && t.team !== user.team)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
  return t;
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const f = parseQuery(query, { paged: true });
    const all = selectTasks(store, user, f);
    const start = (f.page - 1) * f.pageSize;
    send(res, 200, { items: all.slice(start, start + f.pageSize), total: all.length, page: f.page, pageSize: f.pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const f = parseQuery(query, { paged: false });
    send(res, 200, toCsv(selectTasks(store, user, f)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    send(res, 200, visibleTask(store, user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    if (user.role === 'member') throw forbidden();
    const { body, error } = await readBodyLazy(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (error) throw error;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.addAudit(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = visibleTask(store, user, params.id);
    const { body, error } = await readBodyLazy(req);
    if (user.role === 'manager' && (t.team !== user.team || (body.team !== undefined && body.team !== user.team))) throw forbidden();
    if (user.role === 'member' && (t.assignee !== user.id || Object.keys(body).some((k) => k !== 'status'))) throw forbidden();
    if (error) throw error;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    store.addAudit(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    visibleTask(store, user, params.id);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.addAudit(user.id, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
