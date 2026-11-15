'use strict';
const { HttpError, send, readJson } = require('../http');
const { STATUSES, FIELDS } = require('./constants');
const { authenticate, forbidden } = require('./auth');
const { parseQuery, select, bad } = require('./query');
const { toCsv } = require('./csv');

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

/** Đọc body; lỗi JSON được hoãn để kiểm tra quyền (403) chạy trước validate (400). */
async function readBody(req) {
  try {
    return { body: await readJson(req), err: null };
  } catch (err) {
    return { body: null, err };
  }
}

/** Lấy nhiệm vụ user được phép thấy, nếu không → 404. */
function visibleTask(store, user, id) {
  const t = store.getTask(id);
  if (!t || (user.role === 'member' && t.team !== user.team)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
  return t;
}

/** Route theo id không nhận tham số truy vấn nào: tham số đầu tiên theo thứ tự URL bị báo INVALID_QUERY. */
function noQuery(query) {
  for (const k of query.keys()) throw bad(k);
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, { paginate: true });
    const all = select(store, user, q);
    const items = all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    send(res, 200, { items, total: all.length, page: q.page, pageSize: q.pageSize });
  });

  // phải đăng ký trước '/tasks/:id'
  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, { paginate: false });
    send(res, 200, toCsv(select(store, user, q)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params, query }) => {
    const user = authenticate(req, store);
    noQuery(query);
    send(res, 200, visibleTask(store, user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    const { body, err } = await readBody(req);
    if (user.role === 'member') throw forbidden();
    if (user.role === 'manager' && body && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (err) throw err;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.addAudit(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params, query }) => {
    const user = authenticate(req, store);
    noQuery(query);
    const t = visibleTask(store, user, params.id);
    const { body, err } = await readBody(req);
    if (user.role === 'manager') {
      if (t.team !== user.team) throw forbidden();
      if (body && body.team !== undefined && body.team !== user.team) throw forbidden();
    } else if (user.role === 'member') {
      if (t.assignee !== user.id) throw forbidden();
      if (body && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    }
    if (err) throw err;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    store.addAudit(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params, query }) => {
    const user = authenticate(req, store);
    noQuery(query);
    const t = visibleTask(store, user, params.id);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(t.id);
    store.addAudit(user.id, 'delete', t.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
