'use strict';
const { HttpError, send, readJson } = require('../http');
const { requireUser, forbid } = require('../auth');
const { parseListQuery, applyQuery, paginate } = require('../query');
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

/** Đọc body nhưng hoãn lỗi JSON để kiểm tra quyền (403) chạy trước validate body (400). */
async function readBody(req) {
  try {
    return { body: await readJson(req) };
  } catch (err) {
    return { body: {}, err };
  }
}

function findVisible(store, user, id) {
  const t = store.getTask(id);
  if (!t || (user.role === 'member' && t.team !== user.team)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
  return t;
}

function listFor(store, user, query, paging) {
  const parsed = parseListQuery(query, { paging });
  let tasks = store.listTasks();
  if (user.role === 'member') tasks = tasks.filter((t) => t.team === user.team);
  return { tasks: applyQuery(tasks, parsed), parsed };
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = requireUser(store, req);
    const { tasks, parsed } = listFor(store, user, query, true);
    send(res, 200, paginate(tasks, parsed));
  });

  // phải đăng ký trước /tasks/:id
  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = requireUser(store, req);
    const { tasks } = listFor(store, user, query, false);
    send(res, 200, toCsv(tasks), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = requireUser(store, req);
    send(res, 200, findVisible(store, user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = requireUser(store, req);
    if (user.role === 'member') throw forbid();
    const { body, err } = await readBody(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbid();
    if (err) throw err;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.audit.record({ userId: user.id, action: 'create', taskId: t.id, changes: Object.keys(body).sort() });
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = requireUser(store, req);
    const t = findVisible(store, user, params.id);
    const { body, err } = await readBody(req);
    if (user.role === 'manager') {
      if (t.team !== user.team) throw forbid();
      if (body.team !== undefined && body.team !== user.team) throw forbid();
    } else if (user.role === 'member') {
      if (t.assignee !== user.id || Object.keys(body).some((k) => k !== 'status')) throw forbid();
    }
    if (err) throw err;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]).sort();
    const updated = store.updateTask(params.id, body);
    store.audit.record({ userId: user.id, action: 'update', taskId: t.id, changes });
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = requireUser(store, req);
    const t = findVisible(store, user, params.id);
    if (user.role !== 'admin') throw forbid();
    store.deleteTask(t.id);
    store.audit.record({ userId: user.id, action: 'delete', taskId: t.id, changes: [] });
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
