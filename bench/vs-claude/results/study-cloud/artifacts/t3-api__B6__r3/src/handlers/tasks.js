'use strict';
const { HttpError, send, readJson } = require('../http');
const { parseListQuery, applyQuery } = require('../query');
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

function authenticate(store, req) {
  const id = req.headers['x-user'];
  const user = id ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

const forbid = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền thực hiện');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
const hidden = (user, t) => !t || (user.role === 'member' && t.team !== user.team);

/** Đọc body nhưng hoãn lỗi JSON để các kiểm tra quyền chạy trước. */
async function readBodyLazy(req) {
  try {
    return { body: await readJson(req) };
  } catch (err) {
    if (err instanceof HttpError) return { error: err };
    throw err;
  }
}

function listFor(user, query, paginate) {
  const parsed = parseListQuery(query, { paginate });
  if (user.role === 'member') {
    if (parsed.team !== null && parsed.team !== user.team) return { parsed, empty: true };
    parsed.team = user.team;
  }
  return { parsed, empty: false };
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(store, req);
    const { parsed, empty } = listFor(user, query, true);
    const r = empty ? { items: [], total: 0 } : applyQuery(store.listTasks(), parsed);
    send(res, 200, { items: r.items, total: r.total, page: parsed.page, pageSize: parsed.pageSize });
  });

  // Phải đăng ký trước '/tasks/:id'
  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(store, req);
    const { parsed, empty } = listFor(user, query, false);
    const r = empty ? { items: [] } : applyQuery(store.listTasks(), parsed, { paginate: false });
    send(res, 200, toCsv(r.items), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(store, req);
    const t = store.getTask(params.id);
    if (hidden(user, t)) throw notFound();
    send(res, 200, t);
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(store, req);
    if (user.role === 'member') throw forbid();
    const { body, error } = await readBodyLazy(req);
    if (body && user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbid();
    if (error) throw error;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.addAudit(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(store, req);
    const t = store.getTask(params.id);
    if (hidden(user, t)) throw notFound();
    const { body, error } = await readBodyLazy(req);
    if (user.role === 'member') {
      if (t.assignee !== user.id) throw forbid();
      if (body && Object.keys(body).some((k) => k !== 'status')) throw forbid();
    } else if (user.role === 'manager') {
      if (t.team !== user.team) throw forbid();
      if (body && body.team !== undefined && body.team !== user.team) throw forbid();
    }
    if (error) throw error;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    store.addAudit(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(store, req);
    const t = store.getTask(params.id);
    if (hidden(user, t)) throw notFound();
    if (user.role !== 'admin') throw forbid();
    store.deleteTask(params.id);
    store.addAudit(user.id, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, authenticate, STATUSES, FIELDS };
