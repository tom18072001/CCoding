'use strict';
const { HttpError, send, readJson } = require('../http');
const { authenticate, canRead, assertCanCreate, assertCanModifyTask, assertCanPatchBody, assertCanDelete } = require('../auth');
const { parseTaskQuery, applyQuery } = require('../query');
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
  const visible = (user) => (user.role === 'member' ? store.listTasks().filter((t) => t.team === user.team) : store.listTasks());
  const getVisible = (user, id) => {
    const t = store.getTask(id);
    if (!t || !canRead(user, t)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    return t;
  };

  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(store, req);
    const parsed = parseTaskQuery(query, { paging: true });
    const { items, total, page, pageSize } = applyQuery(visible(user), parsed);
    send(res, 200, { items, total, page, pageSize });
  });

  // Phải đăng ký trước /tasks/:id
  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(store, req);
    const parsed = parseTaskQuery(query, { paging: false });
    const { matched } = applyQuery(visible(user), parsed);
    send(res, 200, toCsv(matched), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(store, req);
    send(res, 200, getVisible(user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(store, req);
    if (user.role === 'member') assertCanCreate(user, {});
    const body = await readJson(req);
    assertCanCreate(user, body);
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.audit.record({ userId: user.id, action: 'create', taskId: t.id, changes: Object.keys(body) });
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(store, req);
    const t = getVisible(user, params.id);
    assertCanModifyTask(user, t);
    const body = await readJson(req);
    assertCanPatchBody(user, body);
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    store.audit.record({ userId: user.id, action: 'update', taskId: params.id, changes });
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(store, req);
    getVisible(user, params.id);
    assertCanDelete(user);
    store.deleteTask(params.id);
    store.audit.record({ userId: user.id, action: 'delete', taskId: params.id, changes: [] });
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
