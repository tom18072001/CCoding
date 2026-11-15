'use strict';
const { HttpError, send, readJson } = require('../http');
const { authenticate, forbidden, forceTeam, canSee } = require('../auth');
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

function listFor(user, store, req, paging) {
  const parsed = parseListQuery(req.url, { paging });
  return { parsed, result: applyQuery(store.listTasks(), parsed, { forceTeam: forceTeam(user) }) };
}

function getVisible(user, store, id) {
  const t = store.getTask(id);
  if (!t || !canSee(user, t)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
  return t;
}

function register(router, store, audit) {
  router.route('GET', '/tasks', ({ req, res }) => {
    const user = authenticate(req, store);
    const { parsed, result } = listFor(user, store, req, true);
    send(res, 200, { items: result.items, total: result.total, page: parsed.page, pageSize: parsed.pageSize });
  });

  // Phải đăng ký trước /tasks/:id
  router.route('GET', '/tasks/export.csv', ({ req, res }) => {
    const user = authenticate(req, store);
    const { result } = listFor(user, store, req, false);
    send(res, 200, toCsv(result.items), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    send(res, 200, getVisible(user, store, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    if (user.role === 'member') throw forbidden();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    audit.record(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = getVisible(user, store, params.id);
    if (user.role === 'manager' && t.team !== user.team) throw forbidden();
    if (user.role === 'member' && t.assignee !== user.id) throw forbidden();
    const body = await readJson(req);
    if (user.role === 'member' && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    audit.record(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = getVisible(user, store, params.id);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(t.id);
    audit.record(user.id, 'delete', t.id, []);
    send(res, 204);
  });

  router.route('GET', '/audit', ({ req, res, url }) => {
    const user = authenticate(req, store);
    const seen = new Set();
    for (const k of url.searchParams.keys()) {
      if (k !== 'taskId' || seen.has(k)) throw new HttpError(400, 'INVALID_QUERY', 'Tham số không hợp lệ', { field: k });
      seen.add(k);
    }
    if (user.role !== 'admin') throw forbidden();
    const taskId = url.searchParams.get('taskId');
    send(res, 200, { items: audit.list(taskId === null ? undefined : taskId) });
  });
}

module.exports = { register, STATUSES, FIELDS };
