'use strict';
const { HttpError, send, readJson } = require('../http');

const { parseQuery, applyQuery, paginate } = require('../query');
const { toCsv } = require('../csv');

const STATUSES =['todo', 'doing', 'done'];
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

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');

/** Đọc body nhưng hoãn lỗi JSON đến sau bước kiểm quyền (403 trước 400). */
async function readBody(req) {
  try {
    return { body: await readJson(req) };
  } catch (e) {
    return { error: e };
  }
}

function visibleTask(store, user, id) {
  const t = store.getTask(id);
  if (!t || (user.role === 'member' && t.team !== user.team)) throw notFound();
  return t;
}

function listFor(store, user, query, allowPaging) {
  const parsed = parseQuery(query, { allowPaging });
  const forceTeam = user.role === 'member' ? user.team : undefined;
  return { parsed, ...applyQuery(store.listTasks(), parsed, { forceTeam }) };
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, query }) => {
    const { parsed, items, total } = listFor(store, req.user, query, true);
    send(res, 200, { items: paginate(items, parsed.page, parsed.pageSize), total, page: parsed.page, pageSize: parsed.pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const { items } = listFor(store, req.user, query, false);
    send(res, 200, toCsv(items), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    send(res, 200, visibleTask(store, req.user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = req.user;
    const { body, error } = await readBody(req);
    if (user.role === 'member') throw forbidden();
    if (user.role === 'manager' && body && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (error) throw error;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.addAudit(user.id, 'create', t.id, Object.keys(body).sort());
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = req.user;
    const t = visibleTask(store, user, params.id);
    const { body, error } = await readBody(req);
    if (user.role === 'member') {
      if (t.assignee !== user.id) throw forbidden();
      if (body && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    } else if (user.role === 'manager') {
      if (t.team !== user.team) throw forbidden();
      if (body && body.team !== undefined && body.team !== user.team) throw forbidden();
    }
    if (error) throw error;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]).sort();
    const updated = store.updateTask(params.id, body);
    store.addAudit(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    visibleTask(store, req.user, params.id);
    if (req.user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.addAudit(req.user.id, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
