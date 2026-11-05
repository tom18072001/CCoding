'use strict';
const { HttpError, send, readJson } = require('../http');

const STATUSES = ['todo', 'doing', 'done'];
function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

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
  if (body.dueDate !== undefined && body.dueDate !== null && !validDate(body.dueDate))
    throw new HttpError(400, 'VALIDATION', 'dueDate phải dạng YYYY-MM-DD', { field: 'dueDate' });
}

const QUERY_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function authenticate(req, store) {
  const u = store.user(req.headers['x-user']);
  if (!u) throw new HttpError(401, 'UNAUTHENTICATED', 'Chưa xác thực');
  return u;
}

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');

function fold(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\u0111/g, 'd');
}

function parseQuery(searchParams, allowed) {
  const seen = new Set();
  const q = {};
  for (const [k, v] of searchParams) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const vals = v.split(',');
        if (!vals.every((x) => STATUSES.includes(x))) throw bad(k);
        q.status = vals;
        break;
      }
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        q.team = v;
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        q.dueBefore = v;
        break;
      case 'sort': {
        const f = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw bad(k);
        q.sortField = f;
        q.desc = v.startsWith('-');
        break;
      }
      case 'page':
      case 'pageSize': {
        if (!/^\d+$/.test(v)) throw bad(k);
        const n = Number(v);
        if (n < 1 || (k === 'pageSize' && n > 100)) throw bad(k);
        q[k] = n;
        break;
      }
      default:
        q[k] = v;
    }
  }
  return q;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function selectTasks(store, user, q) {
  const needle = q.q ? fold(q.q) : '';
  let items = store.listTasks().filter((t) => {
    if (user.role === 'member' && t.team !== user.team) return false;
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined && (q.assignee === 'none' ? t.assignee !== null && t.assignee !== undefined : t.assignee !== q.assignee)) return false;
    if (q.team && t.team !== q.team) return false;
    if (needle && !fold(t.title).includes(needle)) return false;
    if (q.dueBefore && !(t.dueDate && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const field = q.sortField || 'createdAt';
  const dir = q.desc ? -1 : 1;
  items = items.sort((a, b) => {
    let c = 0;
    if (field === 'dueDate') {
      const an = a.dueDate == null, bn = b.dueDate == null;
      if (an || bn) {
        if (an && bn) return idNum(a) - idNum(b);
        return an ? 1 : -1;
      }
      c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (field === 'title') c = a.title.localeCompare(b.title, 'vi');
    else if (field === 'priority') c = a.priority - b.priority;
    else c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    return c * dir || idNum(a) - idNum(b);
  });
  return items;
}

const CSV_COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];
function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') {
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    if (/[,"\r\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }
  return String(v);
}
function toCsv(items) {
  const lines = [CSV_COLS.join(','), ...items.map((t) => CSV_COLS.map((c) => csvCell(t[c])).join(','))];
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

async function tryBody(req) {
  try {
    return { body: await readJson(req) };
  } catch (e) {
    return { err: e };
  }
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, url }) => {
    const user = authenticate(req, store);
    const q = parseQuery(url.searchParams, QUERY_PARAMS);
    const all = selectTasks(store, user, q);
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    send(res, 200, { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, url }) => {
    const user = authenticate(req, store);
    const q = parseQuery(url.searchParams, QUERY_PARAMS.filter((k) => k !== 'page' && k !== 'pageSize'));
    send(res, 200, toCsv(selectTasks(store, user, q)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw notFound();
    send(res, 200, t);
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    if (user.role === 'member') throw forbidden();
    const { body, err } = await tryBody(req);
    if (body && user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (err) throw err;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.logAudit(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw notFound();
    const { body, err } = await tryBody(req);
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
    store.logAudit(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw notFound();
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.logAudit(user.id, 'delete', params.id, []);
    send(res, 204);
  });

  router.route('GET', '/audit', ({ req, res, url }) => {
    const user = authenticate(req, store);
    const q = parseQuery(url.searchParams, ['taskId']);
    if (user.role !== 'admin') throw forbidden();
    let items = store.audit;
    if (q.taskId !== undefined) items = items.filter((a) => a.taskId === q.taskId);
    send(res, 200, { items: [...items].reverse() });
  });
}

module.exports = { register, STATUSES, FIELDS };
