'use strict';
const { HttpError, send, sendText, readJson } = require('../http');
const { authenticate } = require('./audit');
const { parseListQuery, applyList } = require('../query');
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

const forbidden = (msg = 'Không đủ quyền') => new HttpError(403, 'FORBIDDEN', msg);
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
const isTeam = (v) => v === 'A' || v === 'B';

/** Nhiệm vụ user được thấy (member chỉ thấy nhóm mình). */
function visibleTasks(store, user) {
  const all = store.listTasks();
  return user.role === 'member' ? all.filter((t) => t.team === user.team) : all;
}

/** Đọc body nhưng hoãn lỗi JSON tới bước validate (sau kiểm tra quyền). */
async function readBody(req) {
  try {
    return { body: await readJson(req) };
  } catch (error) {
    return { error };
  }
}

function listFilters(query, paged) {
  const r = parseListQuery(query, { paged });
  if (!r.ok) throw new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${r.field}`, { field: r.field });
  return { ...r.filters, paged };
}

function getVisible(store, user, id) {
  const t = store.getTask(id);
  if (!t || (user.role === 'member' && t.team !== user.team)) throw notFound();
  return t;
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const filters = listFilters(query, true);
    const { total, items } = applyList(visibleTasks(store, user), filters);
    send(res, 200, { items, total, page: filters.page, pageSize: filters.pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const filters = listFilters(query, false);
    const { items } = applyList(visibleTasks(store, user), filters);
    sendText(res, 200, toCsv(items), 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="tasks.csv"' });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    send(res, 200, getVisible(store, user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    if (user.role === 'member') throw forbidden();
    const { body, error } = await readBody(req);
    if (user.role === 'manager' && body && isTeam(body.team) && body.team !== user.team) throw forbidden('Chỉ tạo cho nhóm mình');
    if (error) throw error;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.addAudit(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = getVisible(store, user, params.id);
    if (user.role === 'manager' && t.team !== user.team) throw forbidden();
    if (user.role === 'member' && t.assignee !== user.id) throw forbidden();
    const { body, error } = await readBody(req);
    if (body) {
      if (user.role === 'manager' && isTeam(body.team) && body.team !== user.team) throw forbidden('Không được chuyển nhóm');
      if (user.role === 'member') {
        const keys = Object.keys(body);
        if (keys.length !== 1 || keys[0] !== 'status') throw forbidden('Member chỉ được sửa status');
      }
    }
    if (error) throw error;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    store.addAudit(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = getVisible(store, user, params.id);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(t.id);
    store.addAudit(user.id, 'delete', t.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
