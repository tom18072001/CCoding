'use strict';
const { HttpError, send, readJson } = require('../http');
const { authenticate, forbidden } = require('../auth');
const { parseQuery, selectTasks, FILTER_KEYS } = require('../query');
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

/** Đọc body nhưng hoãn lỗi JSON để các kiểm tra 404/403 không phụ thuộc body chạy trước. */
async function readBody(req) {
  try {
    return { body: await readJson(req), err: null };
  } catch (err) {
    return { body: null, err };
  }
}

const NOT_FOUND = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');

function register(router, store) {
  // Phải đăng ký trước '/tasks/:id'.
  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, FILTER_KEYS);
    const csv = toCsv(selectTasks(store, q, user));
    send(res, 200, csv, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, [...FILTER_KEYS, 'page', 'pageSize']);
    const all = selectTasks(store, q, user);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    send(res, 200, { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw NOT_FOUND();
    send(res, 200, t);
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    if (user.role === 'member') throw forbidden();
    const { body, err } = await readBody(req);
    if (!err && user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (err) throw err;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.addAudit({ userId: user.id, action: 'create', taskId: t.id, changes: Object.keys(body).sort() });
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw NOT_FOUND();
    if (user.role === 'manager' && t.team !== user.team) throw forbidden();
    if (user.role === 'member' && t.assignee !== user.id) throw forbidden();
    const { body, err } = await readBody(req);
    if (!err) {
      if (user.role === 'member' && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
      if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    }
    if (err) throw err;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]).sort();
    const updated = store.updateTask(params.id, body);
    store.addAudit({ userId: user.id, action: 'update', taskId: t.id, changes });
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw NOT_FOUND();
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.addAudit({ userId: user.id, action: 'delete', taskId: t.id, changes: [] });
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
