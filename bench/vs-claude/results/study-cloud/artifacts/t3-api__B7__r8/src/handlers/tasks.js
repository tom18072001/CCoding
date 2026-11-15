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

const QUERY_ALLOWED = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const CSV_COLUMNS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');

function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

/** Duyệt tham số theo thứ tự trên URL; lỗi đầu tiên được báo. Tham số lạ/lặp → lỗi. */
function parseQuery(query, allowed, check) {
  const seen = new Set();
  const out = {};
  for (const [k, v] of query) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    out[k] = check(k, v);
  }
  return out;
}

function validDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function checkListParam(k, v) {
  switch (k) {
    case 'status': {
      const list = v.split(',');
      if (!list.every((s) => STATUSES.includes(s))) throw bad(k);
      return list;
    }
    case 'team':
      if (!['A', 'B'].includes(v)) throw bad(k);
      return v;
    case 'dueBefore':
      if (!validDate(v)) throw bad(k);
      return v;
    case 'sort':
      if (!SORTS.includes(v.replace(/^-/, ''))) throw bad(k);
      return v;
    case 'page':
      if (!/^\d+$/.test(v) || Number(v) < 1 || !Number.isSafeInteger(Number(v))) throw bad(k);
      return Number(v);
    case 'pageSize':
      if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k);
      return Number(v);
    default:
      return v; // assignee, q
  }
}

function fold(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function queryTasks(store, user, f) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (f.status) items = items.filter((t) => f.status.includes(t.status));
  if (f.assignee !== undefined) items = items.filter((t) => (f.assignee === 'none' ? t.assignee === null || t.assignee === undefined : t.assignee === f.assignee));
  if (f.team) items = items.filter((t) => t.team === f.team);
  if (f.q) {
    const q = fold(f.q);
    items = items.filter((t) => fold(t.title).includes(q));
  }
  if (f.dueBefore) items = items.filter((t) => t.dueDate && t.dueDate <= f.dueBefore);
  const sort = f.sort || 'createdAt';
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
    return c * dir || idNum(a) - idNum(b);
  });
  return items;
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') {
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    if (/[",\r\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
    return v;
  }
  return String(v);
}

function toCsv(items) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const t of items) lines.push(CSV_COLUMNS.map((c) => csvCell(t[c])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const f = parseQuery(query, QUERY_ALLOWED, checkListParam);
    const items = queryTasks(store, user, f);
    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? 20;
    send(res, 200, { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const f = parseQuery(query, QUERY_ALLOWED.filter((k) => k !== 'page' && k !== 'pageSize'), checkListParam);
    send(res, 200, toCsv(queryTasks(store, user, f)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const f = parseQuery(query, ['taskId'], (k, v) => v);
    if (user.role !== 'admin') throw forbidden();
    let items = store.audit.slice();
    if (f.taskId !== undefined) items = items.filter((e) => e.taskId === f.taskId);
    send(res, 200, { items: items.reverse() });
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
    store.log(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw notFound();
    if (user.role === 'manager' && t.team !== user.team) throw forbidden();
    const body = await readJson(req);
    if (user.role === 'member' && (t.assignee !== user.id || Object.keys(body).some((k) => k !== 'status'))) throw forbidden();
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    store.log(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw notFound();
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.log(user.id, 'delete', t.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
