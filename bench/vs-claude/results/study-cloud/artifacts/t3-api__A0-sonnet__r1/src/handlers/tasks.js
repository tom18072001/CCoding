'use strict';
const { HttpError, send } = require('../http');
const { auth, parseQuery, normalize, compareBy, toCsv } = require('../lib');

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

const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];

function visibleTo(user, t) {
  return user.role !== 'member' || t.team === user.team;
}

function forbidden() {
  return new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
}

/** Đọc body nhưng hoãn lỗi JSON tới bước validate (đúng thứ tự kiểm tra). */
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return { body: {} };
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not object');
    return { body: v };
  } catch {
    return { error: new HttpError(400, 'INVALID_JSON', 'Body phải là đối tượng JSON') };
  }
}

function selectTasks(store, user, q) {
  const nq = q.q ? normalize(q.q) : '';
  let items = store.listTasks().filter((t) => {
    if (user.role === 'member' && t.team !== user.team) return false;
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined && (q.assignee === 'none' ? t.assignee !== null : t.assignee !== q.assignee)) return false;
    if (q.team && t.team !== q.team) return false;
    if (nq && !normalize(t.title).includes(nq)) return false;
    if (q.dueBefore && !(t.dueDate && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  items.sort(compareBy(q.sort));
  return items;
}

function register(router, store) {
  const guard = (fn) => (ctx) => fn({ ...ctx, user: auth(store, ctx.req) });

  router.route('GET', '/tasks/export.csv', guard(({ res, query, user }) => {
    const q = parseQuery(query, LIST_PARAMS.filter((k) => k !== 'page' && k !== 'pageSize'));
    send(res, 200, toCsv(selectTasks(store, user, q)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  }));

  router.route('GET', '/tasks', guard(({ res, query, user }) => {
    const q = parseQuery(query, LIST_PARAMS);
    const all = selectTasks(store, user, q);
    const items = all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    send(res, 200, { items, total: all.length, page: q.page, pageSize: q.pageSize });
  }));

  router.route('GET', '/audit', guard(({ res, query, user }) => {
    const seen = new Set();
    for (const k of query.keys()) {
      if (k !== 'taskId' || seen.has(k)) throw new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${k}`, { field: k });
      seen.add(k);
    }
    if (user.role !== 'admin') throw forbidden();
    const taskId = query.get('taskId');
    const items = store.audit.filter((e) => taskId === null || e.taskId === taskId).reverse();
    send(res, 200, { items });
  }));

  router.route('GET', '/tasks/:id', guard(({ res, params, user }) => {
    const t = store.getTask(params.id);
    if (!t || !visibleTo(user, t)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    send(res, 200, t);
  }));

  router.route('POST', '/tasks', guard(async ({ req, res, user }) => {
    const { body, error } = await readBody(req);
    if (user.role === 'member') throw forbidden();
    if (user.role === 'manager' && body && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (error) throw error;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.log(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  }));

  router.route('PATCH', '/tasks/:id', guard(async ({ req, res, params, user }) => {
    const t = store.getTask(params.id);
    if (!t || !visibleTo(user, t)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    const { body, error } = await readBody(req);
    if (user.role === 'manager') {
      if (t.team !== user.team) throw forbidden();
      if (body && body.team !== undefined && body.team !== user.team) throw forbidden();
    } else if (user.role === 'member') {
      if (t.assignee !== user.id) throw forbidden();
      if (body && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    }
    if (error) throw error;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    store.log(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  }));

  router.route('DELETE', '/tasks/:id', guard(({ res, params, user }) => {
    const t = store.getTask(params.id);
    if (!t || !visibleTo(user, t)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.log(user.id, 'delete', t.id, []);
    send(res, 204);
  }));
}

module.exports = { register, STATUSES, FIELDS };
