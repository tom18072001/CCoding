'use strict';
const { HttpError, send, readJson } = require('../http');
const { authenticate, forbidden } = require('../auth');

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

const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const CSV_COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function invalidQuery(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Phân tích query theo thứ tự xuất hiện trên URL; lỗi đầu tiên được báo. */
function parseListQuery(query, { paged }) {
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];
  if (paged) allowed.push('page', 'pageSize');
  const seen = new Set();
  const f = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  for (const [k, v] of query.entries()) {
    if (!allowed.includes(k) || seen.has(k)) throw invalidQuery(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const vals = v.split(',');
        if (!vals.every((x) => STATUSES.includes(x))) throw invalidQuery(k);
        f.status = vals;
        break;
      }
      case 'assignee': f.assignee = v; break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw invalidQuery(k);
        f.team = v;
        break;
      case 'q': f.q = fold(v); break;
      case 'dueBefore':
        if (!validDate(v)) throw invalidQuery(k);
        f.dueBefore = v;
        break;
      case 'sort': {
        const name = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(name)) throw invalidQuery(k);
        f.sort = name;
        f.desc = v.startsWith('-');
        break;
      }
      case 'page':
        if (!/^[0-9]+$/.test(v) || Number(v) < 1) throw invalidQuery(k);
        f.page = Number(v);
        break;
      case 'pageSize':
        if (!/^[0-9]+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw invalidQuery(k);
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
  if (f.status) items = items.filter((t) => f.status.includes(t.status));
  if (f.assignee !== undefined) items = items.filter((t) => (f.assignee === 'none' ? t.assignee === null || t.assignee === undefined : t.assignee === f.assignee));
  if (f.team) items = items.filter((t) => t.team === f.team);
  if (f.q) items = items.filter((t) => fold(t.title).includes(f.q));
  if (f.dueBefore) items = items.filter((t) => t.dueDate && t.dueDate <= f.dueBefore);
  const dir = f.desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    if (f.sort === 'dueDate') {
      const an = a.dueDate == null, bn = b.dueDate == null;
      if (an || bn) return an && bn ? idNum(a) - idNum(b) : an ? 1 : -1;
      c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (f.sort === 'priority') c = a.priority - b.priority;
    else if (f.sort === 'title') c = a.title.localeCompare(b.title, 'vi');
    else c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    return c * dir || idNum(a) - idNum(b);
  };
  return items.sort(cmp);
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(items) {
  const lines = [CSV_COLS.join(','), ...items.map((t) => CSV_COLS.map((c) => csvCell(t[c])).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function notFound() {
  return new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
}

function visibleTask(store, user, id) {
  const t = store.getTask(id);
  if (!t || (user.role === 'member' && t.team !== user.team)) throw notFound();
  return t;
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const f = parseListQuery(query, { paged: true });
    const all = queryTasks(store, user, f);
    const start = (f.page - 1) * f.pageSize;
    send(res, 200, { items: all.slice(start, start + f.pageSize), total: all.length, page: f.page, pageSize: f.pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const f = parseListQuery(query, { paged: false });
    send(res, 200, toCsv(queryTasks(store, user, f)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    send(res, 200, visibleTask(store, user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    if (user.role === 'member') throw forbidden();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.logAudit(user.id, 'create', t.id, Object.keys(body).sort());
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = visibleTask(store, user, params.id);
    if (user.role === 'manager' && t.team !== user.team) throw forbidden();
    if (user.role === 'member' && t.assignee !== user.id) throw forbidden();
    const body = await readJson(req);
    if (user.role === 'member' && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]).sort();
    const updated = store.updateTask(params.id, body);
    store.logAudit(user.id, 'update', params.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    visibleTask(store, user, params.id);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.logAudit(user.id, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
