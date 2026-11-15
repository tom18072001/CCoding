'use strict';
const { HttpError, send, readJson } = require('../http');

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

const ID_NUM = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const FILTER_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = id === undefined ? undefined : store.user(id);
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
const badQuery = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd');
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Duyệt tham số theo thứ tự trên URL; lỗi đầu tiên được báo. */
function parseQuery(query, allowed) {
  const out = {};
  for (const [k, v] of query) {
    if (!allowed.includes(k) || k in out) throw badQuery(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((x) => STATUSES.includes(x))) throw badQuery(k);
        out.status = parts;
        break;
      }
      case 'team':
        if (!['A', 'B'].includes(v)) throw badQuery(k);
        out.team = v;
        break;
      case 'dueBefore':
        if (!validDate(v)) throw badQuery(k);
        out.dueBefore = v;
        break;
      case 'sort':
        if (!SORTS.includes(v.replace(/^-/, ''))) throw badQuery(k);
        out.sort = v;
        break;
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1 || !Number.isSafeInteger(Number(v))) throw badQuery(k);
        out.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw badQuery(k);
        out.pageSize = Number(v);
        break;
      default:
        out[k] = v; // assignee, q, taskId
    }
  }
  return out;
}

function queryTasks(store, user, p) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (p.status) items = items.filter((t) => p.status.includes(t.status));
  if (p.assignee !== undefined) items = items.filter((t) => (p.assignee === 'none' ? t.assignee === null || t.assignee === undefined : t.assignee === p.assignee));
  if (p.team) items = items.filter((t) => t.team === p.team);
  if (p.q) {
    const q = normalize(p.q);
    items = items.filter((t) => normalize(String(t.title)).includes(q));
  }
  if (p.dueBefore) items = items.filter((t) => t.dueDate && t.dueDate <= p.dueBefore);
  const sort = p.sort || 'createdAt';
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const cmpVal = (a, b) => {
    if (field === 'title') return a.title.localeCompare(b.title, 'vi');
    return a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
  };
  items.sort((a, b) => {
    if (field === 'dueDate') {
      const an = a.dueDate == null, bn = b.dueDate == null;
      if (an || bn) return an && bn ? ID_NUM(a) - ID_NUM(b) : an ? 1 : -1;
    }
    const c = cmpVal(a, b);
    return c !== 0 ? (desc ? -c : c) : ID_NUM(a) - ID_NUM(b);
  });
  return items;
}

const CSV_COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];
function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return String(v);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function toCsv(items) {
  const lines = [CSV_COLS.join(','), ...items.map((t) => CSV_COLS.map((c) => csvCell(t[c])).join(','))];
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const p = parseQuery(query, [...FILTER_PARAMS, 'page', 'pageSize']);
    const all = queryTasks(store, user, p);
    const page = p.page || 1, pageSize = p.pageSize || 20;
    send(res, 200, { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const p = parseQuery(query, FILTER_PARAMS);
    send(res, 200, toCsv(queryTasks(store, user, p)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const p = parseQuery(query, ['taskId']);
    if (user.role !== 'admin') throw forbidden();
    let items = [...store.audit].reverse();
    if (p.taskId !== undefined) items = items.filter((e) => e.taskId === p.taskId);
    send(res, 200, { items });
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
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.logAudit(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw notFound();
    if (user.role === 'manager' && t.team !== user.team) throw forbidden();
    if (user.role === 'member' && t.assignee !== user.id) throw forbidden();
    const body = await readJson(req);
    if (user.role === 'member' && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
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
    store.logAudit(user.id, 'delete', t.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
