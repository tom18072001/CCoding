'use strict';
const { HttpError, send, readJson } = require('../http');
const { authenticate, forbidden } = require('../auth');
const { parseTaskQuery, applyTaskQuery, paginate } = require('../query');
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

const same = (a, b) => (a ?? null) === (b ?? null);

function register(router, store) {
  // Tập nguồn theo quyền đọc: member chỉ thấy nhóm mình (áp trước khi lọc).
  const visible = (user) => store.listTasks().filter((t) => user.role !== 'member' || t.team === user.team);

  // member với nhiệm vụ nhóm khác → 404 (không lộ sự tồn tại).
  const findReadable = (user, id) => {
    const t = store.getTask(id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    return t;
  };

  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const parsed = parseTaskQuery(query, { allowPaging: true });
    const { items, total } = applyTaskQuery(visible(user), parsed);
    send(res, 200, { items: paginate(items, parsed), total, page: parsed.page, pageSize: parsed.pageSize });
  });

  // Phải đăng ký trước '/tasks/:id'.
  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const parsed = parseTaskQuery(query, { allowPaging: false });
    const { items } = applyTaskQuery(visible(user), parsed);
    send(res, 200, toCsv(items), {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    send(res, 200, findReadable(user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    if (user.role === 'member') throw forbidden();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.addAudit(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = findReadable(user, params.id);
    if (user.role === 'manager' && t.team !== user.team) throw forbidden();
    if (user.role === 'member' && t.assignee !== user.id) throw forbidden();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (user.role === 'member' && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => !same(body[k], t[k]));
    const updated = store.updateTask(params.id, body);
    store.addAudit(user.id, 'update', params.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    findReadable(user, params.id);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.addAudit(user.id, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
