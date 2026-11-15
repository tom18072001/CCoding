'use strict';
const { HttpError, send, readJson } = require('../http');

const STATUSES = ['todo', 'doing', 'done'];
const FIELDS = ['title', 'status', 'priority', 'assignee', 'team', 'dueDate'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const CSV_COLUMNS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền thực hiện');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
const badQuery = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'D').toLowerCase();
}

/** Duyệt tham số theo thứ tự trên URL; lỗi đầu tiên được báo. */
function parseQuery(searchParams, allowed, parsers) {
  const out = {};
  const seen = new Set();
  for (const [k, v] of searchParams) {
    if (!allowed.includes(k) || seen.has(k)) throw badQuery(k);
    seen.add(k);
    out[k] = parsers[k] ? parsers[k](v, k) : v;
  }
  return out;
}

const intIn = (min, max) => (v, k) => {
  if (!/^\d+$/.test(v)) throw badQuery(k);
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw badQuery(k);
  return n;
};

const LIST_PARSERS = {
  status: (v, k) => {
    const parts = v.split(',');
    if (!parts.every((p) => STATUSES.includes(p))) throw badQuery(k);
    return parts;
  },
  team: (v, k) => {
    if (!['A', 'B'].includes(v)) throw badQuery(k);
    return v;
  },
  dueBefore: (v, k) => {
    if (!validDate(v)) throw badQuery(k);
    return v;
  },
  sort: (v, k) => {
    if (!SORTS.includes(v.startsWith('-') ? v.slice(1) : v)) throw badQuery(k);
    return v;
  },
  page: intIn(1, Number.MAX_SAFE_INTEGER),
  pageSize: intIn(1, 100),
};

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function canSee(user, task) {
  return user.role !== 'member' || task.team === user.team;
}

/** Lọc + sắp xếp (chưa phân trang). */
function queryTasks(store, user, q) {
  let items = store.listTasks().filter((t) => canSee(user, t));
  if (q.status) items = items.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee == null : t.assignee === q.assignee));
  if (q.team) items = items.filter((t) => t.team === q.team);
  if (q.q) {
    const needle = fold(q.q);
    items = items.filter((t) => fold(t.title).includes(needle));
  }
  if (q.dueBefore) items = items.filter((t) => t.dueDate != null && t.dueDate <= q.dueBefore);

  const sort = q.sort || 'createdAt';
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const dir = desc ? -1 : 1;
  items.sort((a, b) => {
    let c = 0;
    if (field === 'dueDate') {
      const an = a.dueDate == null, bn = b.dueDate == null;
      if (an !== bn) return an ? 1 : -1;
      if (!an) c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (field === 'title') c = a.title.localeCompare(b.title, 'vi');
    else c = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
    if (c !== 0) return c * dir;
    return idNum(a) - idNum(b);
  });
  return items;
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[,"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function validate(body, store, { partial }) {
  for (const k of Object.keys(body)) if (!FIELDS.includes(k)) throw new HttpError(400, 'VALIDATION', `Trường không hợp lệ: ${k}`, { field: k });
  const need = partial ? [] : ['title', 'team'];
  for (const k of need) if (body[k] === undefined) throw new HttpError(400, 'VALIDATION', `Thiếu ${k}`, { field: k });
  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200))
    throw new HttpError(400, 'VALIDATION', 'title phải là chuỗi 1–200 ký tự', { field: 'title' });
  if (body.status !== undefined && !STATUSES.includes(body.status)) throw new HttpError(400, 'VALIDATION', 'status không hợp lệ', { field: 'status' });
  if (body.priority !== undefined && ![1, 2, 3].includes(body.priority)) throw new HttpError(400, 'VALIDATION', 'priority phải là 1, 2 hoặc 3', { field: 'priority' });
  if (body.assignee !== undefined && body.assignee !== null && !(typeof body.assignee === 'string' && store.user(body.assignee)))
    throw new HttpError(400, 'VALIDATION', 'assignee không tồn tại', { field: 'assignee' });
  if (body.team !== undefined && !['A', 'B'].includes(body.team)) throw new HttpError(400, 'VALIDATION', 'team không hợp lệ', { field: 'team' });
  if (body.dueDate !== undefined && body.dueDate !== null && !(typeof body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)))
    throw new HttpError(400, 'VALIDATION', 'dueDate phải dạng YYYY-MM-DD', { field: 'dueDate' });
}

function register(router, store) {
  const auth = (req) => {
    const id = req.headers['x-user'];
    const user = typeof id === 'string' ? store.user(id) : undefined;
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    return user;
  };

  const loadReadable = (user, id) => {
    const t = store.getTask(id);
    if (!t || !canSee(user, t)) throw notFound();
    return t;
  };

  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = auth(req);
    const q = parseQuery(query, LIST_PARAMS, LIST_PARSERS);
    const all = queryTasks(store, user, q);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const items = all.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    send(res, 200, { items, total: all.length, page, pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = auth(req);
    const q = parseQuery(query, LIST_PARAMS.filter((p) => p !== 'page' && p !== 'pageSize'), LIST_PARSERS);
    const rows = queryTasks(store, user, q);
    let out = '\uFEFF' + CSV_COLUMNS.join(',') + '\r\n';
    for (const t of rows) out += CSV_COLUMNS.map((c) => csvCell(t[c])).join(',') + '\r\n';
    send(res, 200, out, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = auth(req);
    send(res, 200, loadReadable(user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = auth(req);
    if (user.role === 'member') throw forbidden();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.addAudit(user.id, 'create', t.id, Object.keys(body).sort());
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = auth(req);
    const t = loadReadable(user, params.id);
    if (user.role === 'member' && t.assignee !== user.id) throw forbidden();
    if (user.role === 'manager' && t.team !== user.team) throw forbidden();
    const body = await readJson(req);
    if (user.role === 'member' && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]).sort();
    const updated = store.updateTask(params.id, body);
    store.addAudit(user.id, 'update', params.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = auth(req);
    loadReadable(user, params.id);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.addAudit(user.id, 'delete', params.id, []);
    send(res, 204);
  });

  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = auth(req);
    const q = parseQuery(query, ['taskId'], {});
    if (user.role !== 'admin') throw forbidden();
    let items = store.audit.slice().reverse();
    if (q.taskId !== undefined) items = items.filter((e) => e.taskId === q.taskId);
    send(res, 200, { items });
  });
}

module.exports = { register, STATUSES, FIELDS };
