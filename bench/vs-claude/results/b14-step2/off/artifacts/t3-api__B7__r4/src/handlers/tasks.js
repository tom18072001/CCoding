'use strict';
const { HttpError, send, readJson } = require('../http');

const STATUSES = ['todo', 'doing', 'done'];
const FIELDS = ['title', 'status', 'priority', 'assignee', 'team', 'dueDate'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const FILTER_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

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

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
const badQuery = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số truy vấn không hợp lệ: ${field}`, { field });

function auth(req, store) {
  const id = req.headers['x-user'];
  const u = typeof id === 'string' ? store.user(id) : undefined;
  if (!u) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return u;
}

/** Duyệt tham số theo thứ tự xuất hiện đầu tiên trên URL; trả về Map tên → giá trị. */
function parseParams(query, allowed, check) {
  const order = [];
  const counts = new Map();
  const values = new Map();
  for (const [k, v] of query.entries()) {
    if (!counts.has(k)) {
      order.push(k);
      values.set(k, v);
    }
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  for (const k of order) {
    if (!allowed.includes(k) || counts.get(k) > 1) throw badQuery(k);
    if (check) check(k, values.get(k));
  }
  return values;
}

function checkListParam(k, v) {
  let ok = true;
  switch (k) {
    case 'status': ok = v.split(',').every((s) => STATUSES.includes(s)); break;
    case 'team': ok = v === 'A' || v === 'B'; break;
    case 'dueBefore': ok = validDate(v); break;
    case 'sort': ok = SORTS.includes(v.replace(/^-/, '')); break;
    case 'page': ok = /^\d+$/.test(v) && Number(v) >= 1 && Number.isSafeInteger(Number(v)); break;
    case 'pageSize': ok = /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 100; break;
    default: break;
  }
  if (!ok) throw badQuery(k);
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function queryTasks(store, user, p) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (p.has('status')) {
    const set = new Set(p.get('status').split(','));
    items = items.filter((t) => set.has(t.status));
  }
  if (p.has('assignee')) {
    const a = p.get('assignee');
    items = items.filter((t) => (a === 'none' ? t.assignee === null || t.assignee === undefined : t.assignee === a));
  }
  if (p.has('team')) items = items.filter((t) => t.team === p.get('team'));
  if (p.get('q')) {
    const q = fold(p.get('q'));
    items = items.filter((t) => fold(t.title).includes(q));
  }
  if (p.has('dueBefore')) items = items.filter((t) => t.dueDate && t.dueDate <= p.get('dueBefore'));
  const sortRaw = p.get('sort') || 'createdAt';
  const desc = sortRaw.startsWith('-');
  const field = desc ? sortRaw.slice(1) : sortRaw;
  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    if (field === 'dueDate') {
      const an = !a.dueDate;
      const bn = !b.dueDate;
      if (an || bn) return an && bn ? idNum(a) - idNum(b) : an ? 1 : -1;
      c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (field === 'priority') c = a.priority - b.priority;
    else if (field === 'title') c = a.title.localeCompare(b.title, 'vi');
    else c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    return c * dir || idNum(a) - idNum(b);
  };
  return items.sort(cmp);
}

const CSV_COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];
function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function register(router, store) {
  const audit = (userId, action, taskId, changes) =>
    store.addAudit({ at: store.now().toISOString(), userId, action, taskId, changes });
  const visible = (user, t) => t && !(user.role === 'member' && t.team !== user.team);

  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = auth(req, store);
    const p = parseParams(query, LIST_PARAMS, checkListParam);
    const all = queryTasks(store, user, p);
    const page = p.has('page') ? Number(p.get('page')) : 1;
    const pageSize = p.has('pageSize') ? Number(p.get('pageSize')) : 20;
    send(res, 200, { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = auth(req, store);
    const p = parseParams(query, FILTER_PARAMS, checkListParam);
    const rows = queryTasks(store, user, p).map((t) => CSV_COLS.map((c) => csvCell(t[c])).join(','));
    const text = '﻿' + [CSV_COLS.join(','), ...rows].join('\r\n') + '\r\n';
    send(res, 200, text, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = auth(req, store);
    const t = store.getTask(params.id);
    if (!visible(user, t)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    send(res, 200, t);
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = auth(req, store);
    if (user.role === 'member') throw forbidden();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    audit(user.id, 'create', t.id, Object.keys(body).sort());
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = auth(req, store);
    const t = store.getTask(params.id);
    if (!visible(user, t)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    if (user.role === 'manager' && t.team !== user.team) throw forbidden();
    if (user.role === 'member' && t.assignee !== user.id) throw forbidden();
    const body = await readJson(req);
    if (user.role === 'member' && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]).sort();
    const updated = store.updateTask(params.id, body);
    audit(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = auth(req, store);
    const t = store.getTask(params.id);
    if (!visible(user, t)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    audit(user.id, 'delete', params.id, []);
    send(res, 204);
  });

  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = auth(req, store);
    const p = parseParams(query, ['taskId']);
    if (user.role !== 'admin') throw forbidden();
    let items = store.audit.slice().reverse();
    if (p.has('taskId')) items = items.filter((e) => e.taskId === p.get('taskId'));
    send(res, 200, { items });
  });
}

module.exports = { register, STATUSES, FIELDS };
