'use strict';
const { HttpError, send, readJson } = require('../http');
const { authenticate, forbidden, canRead } = require('../auth');
const { record } = require('../audit');
const { parseListQuery, applyListQuery } = require('../query');
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

function register(router, store) {
  const listFor = (user, query, paginate) => {
    const parsed = parseListQuery(query, { paginate });
    const team = user.role === 'member' ? user.team : null;
    return applyListQuery(store.listTasks(), parsed, { team });
  };

  const load = (user, id) => {
    const t = store.getTask(id);
    if (!t || !canRead(user, t)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    return t;
  };

  // Phải đăng ký trước /tasks/:id
  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const { items } = listFor(user, query, false);
    send(res, 200, toCsv(items), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const { items, total, page, pageSize } = listFor(user, query, true);
    send(res, 200, { items, total, page, pageSize });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    send(res, 200, load(user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    if (user.role === 'member') throw forbidden();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    record(store, { userId: user.id, action: 'create', taskId: t.id, changes: Object.keys(body) });
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = load(user, params.id);
    const body = await readJson(req);
    if (user.role === 'member') {
      const keys = Object.keys(body);
      if (t.assignee !== user.id || keys.length !== 1 || keys[0] !== 'status') throw forbidden();
    } else if (user.role === 'manager') {
      if (t.team !== user.team) throw forbidden();
      if (body.team !== undefined && body.team !== user.team) throw forbidden();
    }
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    record(store, { userId: user.id, action: 'update', taskId: t.id, changes });
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = load(user, params.id);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(t.id);
    record(store, { userId: user.id, action: 'delete', taskId: t.id, changes: [] });
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
