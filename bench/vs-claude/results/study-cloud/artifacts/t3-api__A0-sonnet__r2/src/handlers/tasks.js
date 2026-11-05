'use strict';
const { HttpError, send, readJson } = require('../http');

const STATUSES = ['todo', 'doing', 'done'];
const FIELDS = ['title', 'status', 'priority', 'assignee', 'team', 'dueDate'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const CSV_COLUMNS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function isValidDate(s) {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(2000, mo - 1, d));
  dt.setUTCFullYear(y);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function validate(body, store, { partial }) {
  for (const k of Object.keys(body)) if (!FIELDS.includes(k)) throw new HttpError(400, 'VALIDATION', `Trường không hợp lệ: ${k}`, { field: k });
  const need = partial ? [] : ['title', 'team'];
  for (const k of need) if (body[k] === undefined) throw new HttpError(400, 'VALIDATION', `Thiếu ${k}`, { field: k });
  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200))
    throw new HttpError(400, 'VALIDATION', 'title phải là chuỗi 1–200 ký tự', { field: 'title' });
  if (body.status !== undefined && !STATUSES.includes(body.status)) throw new HttpError(400, 'VALIDATION', 'status không hợp lệ', { field: 'status' });
  if (body.priority !== undefined && ![1, 2, 3].includes(body.priority)) throw new HttpError(400, 'VALIDATION', 'priority phải là 1, 2 hoặc 3', { field: 'priority' });
  if (body.assignee !== undefined && body.assignee !== null && (typeof body.assignee !== 'string' || !store.user(body.assignee)))
    throw new HttpError(400, 'VALIDATION', 'assignee không tồn tại', { field: 'assignee' });
  if (body.team !== undefined && !['A', 'B'].includes(body.team)) throw new HttpError(400, 'VALIDATION', 'team không hợp lệ', { field: 'team' });
  if (body.dueDate !== undefined && body.dueDate !== null && !isValidDate(body.dueDate))
    throw new HttpError(400, 'VALIDATION', 'dueDate phải dạng YYYY-MM-DD', { field: 'dueDate' });
}

function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Chưa xác thực');
  return user;
}

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
const badQuery = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function fold(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

/** Phân tích tham số truy vấn của danh sách. allowPaging=false cho CSV. */
function parseListQuery(searchParams, allowPaging) {
  const allowed = allowPaging ? LIST_PARAMS : LIST_PARAMS.filter((p) => p !== 'page' && p !== 'pageSize');
  const seen = new Set();
  const f = { page: 1, pageSize: 20, sort: 'createdAt', desc: false };
  for (const [k, v] of searchParams) {
    if (!allowed.includes(k) || seen.has(k)) throw badQuery(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw badQuery(k);
        f.status = new Set(parts);
        break;
      }
      case 'assignee':
        f.assignee = v;
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw badQuery(k);
        f.team = v;
        break;
      case 'q':
        if (v !== '') f.q = fold(v);
        break;
      case 'dueBefore':
        if (!isValidDate(v)) throw badQuery(k);
        f.dueBefore = v;
        break;
      case 'sort': {
        const name = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(name)) throw badQuery(k);
        f.sort = name;
        f.desc = v.startsWith('-');
        break;
      }
      case 'page':
        if (!/^[0-9]+$/.test(v) || Number(v) < 1 || !Number.isSafeInteger(Number(v))) throw badQuery(k);
        f.page = Number(v);
        break;
      case 'pageSize':
        if (!/^[0-9]+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw badQuery(k);
        f.pageSize = Number(v);
        break;
    }
  }
  return f;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function queryTasks(store, user, f) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (f.status) items = items.filter((t) => f.status.has(t.status));
  if (f.assignee !== undefined) items = items.filter((t) => (f.assignee === 'none' ? t.assignee === null : t.assignee === f.assignee));
  if (f.team) items = items.filter((t) => t.team === f.team);
  if (f.q) items = items.filter((t) => fold(String(t.title)).includes(f.q));
  if (f.dueBefore) items = items.filter((t) => t.dueDate != null && t.dueDate <= f.dueBefore);
  const dir = f.desc ? -1 : 1;
  const cmp = (a, b) => {
    let r = 0;
    if (f.sort === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) return an === bn ? idNum(a) - idNum(b) : an ? 1 : -1; // null luôn cuối
      r = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (f.sort === 'title') r = String(a.title).localeCompare(String(b.title), 'vi');
    else if (f.sort === 'priority') r = a.priority - b.priority;
    else r = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    return r * dir || idNum(a) - idNum(b);
  };
  return items.sort(cmp);
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(items) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const t of items) lines.push(CSV_COLUMNS.map((c) => csvCell(t[c])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, url }) => {
    const user = authenticate(req, store);
    const f = parseListQuery(url.searchParams, true);
    const all = queryTasks(store, user, f);
    const start = (f.page - 1) * f.pageSize;
    send(res, 200, { items: all.slice(start, start + f.pageSize), total: all.length, page: f.page, pageSize: f.pageSize });
  });

  // phải đăng ký trước /tasks/:id
  router.route('GET', '/tasks/export.csv', ({ req, res, url }) => {
    const user = authenticate(req, store);
    const f = parseListQuery(url.searchParams, false);
    send(res, 200, toCsv(queryTasks(store, user, f)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/audit', ({ req, res, url }) => {
    const user = authenticate(req, store);
    let taskId;
    const seen = new Set();
    for (const [k, v] of url.searchParams) {
      if (k !== 'taskId' || seen.has(k)) throw badQuery(k);
      seen.add(k);
      taskId = v;
    }
    if (user.role !== 'admin') throw forbidden();
    let items = store.audit.slice().reverse();
    if (taskId !== undefined) items = items.filter((e) => e.taskId === taskId);
    send(res, 200, { items });
  });

  const visible = (user, t) => user.role !== 'member' || t.team === user.team;

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || !visible(user, t)) throw notFound();
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
    if (!t || !visible(user, t)) throw notFound();
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
    if (!t || !visible(user, t)) throw notFound();
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.logAudit(user.id, 'delete', t.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
