'use strict';
const { HttpError, send, readJson } = require('../http');
const { parseQuery, selectTasks } = require('./query');
const { toCsv } = require('./csv');

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

const forbid = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

function register(router, store) {
  router.route('GET', '/tasks/export.csv', ({ res, query, user }) => {
    const q = parseQuery(query, LIST_PARAMS);
    send(res, 200, toCsv(selectTasks(store, user, q)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks', ({ res, query, user }) => {
    const q = parseQuery(query, [...LIST_PARAMS, 'page', 'pageSize']);
    const all = selectTasks(store, user, q);
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    send(res, 200, { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize });
  });

  const visible = (user, id) => {
    const t = store.getTask(id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw notFound();
    return t;
  };

  router.route('GET', '/tasks/:id', ({ res, params, user }) => {
    send(res, 200, visible(user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res, user }) => {
    if (user.role === 'member') throw forbid();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbid();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.log(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params, user }) => {
    const t = visible(user, params.id);
    if (user.role === 'manager' && t.team !== user.team) throw forbid();
    if (user.role === 'member' && t.assignee !== user.id) throw forbid();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbid();
    if (user.role === 'member' && Object.keys(body).some((k) => k !== 'status')) throw forbid();
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    store.log(user.id, 'update', params.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ res, params, user }) => {
    visible(user, params.id);
    if (user.role !== 'admin') throw forbid();
    store.deleteTask(params.id);
    store.log(user.id, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
