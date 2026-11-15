'use strict';
const { HttpError, send, sendText, readJson } = require('../http');
const { forbidden, assertCanRead, assertCanModifyTask, assertCanPatchBody } = require('../auth');
const { parseQuery, applyQuery } = require('../query');
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
  const scope = (user) => (user.role === 'member' ? user.team : null);

  router.route('GET', '/tasks', ({ res, query, user }) => {
    const parsed = parseQuery(query, { paginate: true });
    const { items, total } = applyQuery(store.listTasks(), parsed, { teamScope: scope(user) });
    send(res, 200, { items, total, page: parsed.page, pageSize: parsed.pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ res, query, user }) => {
    const parsed = parseQuery(query, { paginate: false });
    const { items } = applyQuery(store.listTasks(), parsed, { teamScope: scope(user), paginate: false });
    sendText(res, 200, toCsv(items), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks/:id', ({ res, params, user }) => {
    const t = store.getTask(params.id);
    assertCanRead(user, t);
    send(res, 200, t);
  });

  router.route('POST', '/tasks', async ({ req, res, user }) => {
    if (user.role === 'member') throw forbidden();
    const body = await readJson(req);
    if (user.role === 'manager' && ['A', 'B'].includes(body.team) && body.team !== user.team) throw forbidden('Chỉ tạo cho nhóm mình');
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.logAudit(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params, user }) => {
    const t = store.getTask(params.id);
    assertCanRead(user, t);
    assertCanModifyTask(user, t);
    const body = await readJson(req);
    assertCanPatchBody(user, body);
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    store.logAudit(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ res, params, user }) => {
    const t = store.getTask(params.id);
    assertCanRead(user, t);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.logAudit(user.id, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
