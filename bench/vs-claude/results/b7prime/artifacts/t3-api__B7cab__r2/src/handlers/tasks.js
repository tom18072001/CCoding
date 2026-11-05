'use strict';
const { HttpError, send, readJson } = require('../http');

const STATUSES = ['todo', 'doing', 'done'];
const FIELDS = ['title', 'status', 'priority', 'assignee', 'team', 'dueDate'];

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function authenticate(req, store) {
  const u = store.user(req.headers['x-user']);
  if (!u) throw new HttpError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
  return u;
}

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
const badQuery = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function fold(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
}

function parseQuery(searchParams, { paging }) {
  const allowed = paging ? LIST_PARAMS : LIST_PARAMS.filter((k) => k !== 'page' && k !== 'pageSize');
  const f = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  const seen = new Set();
  for (const [k, v] of searchParams) {
    if (!allowed.includes(k) || seen.has(k)) throw badQuery(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const vals = v.split(',');
        if (!vals.every((x) => STATUSES.includes(x))) throw badQuery(k);
        f.status = vals;
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
        f.q = fold(v);
        break;
      case 'dueBefore':
        if (!validDate(v)) throw badQuery(k);
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
        if (!/^\d{1,15}$/.test(v) || Number(v) < 1) throw badQuery(k);
        f.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d{1,4}$/.test(v) || Number(v) < 1 || Number(v) > 100) throw badQuery(k);
        f.pageSize = Number(v);
        break;
    }
  }
  return f;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function query(store, user, f) {
  const items = store.listTasks().filter((t) => {
    if (user.role === 'member' && t.team !== user.team) return false;
    if (f.status && !f.status.includes(t.status)) return false;
    if (f.assignee !== undefined && (f.assignee === 'none' ? t.assignee != null : t.assignee !== f.assignee)) return false;
    if (f.team && t.team !== f.team) return false;
    if (f.q && !fold(t.title).includes(f.q)) return false;
    if (f.dueBefore && !(t.dueDate && t.dueDate <= f.dueBefore)) return false;
    return true;
  });
  const dir = f.desc ? -1 : 1;
  return items.sort((a, b) => {
    let c = 0;
    if (f.sort === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an !== bn) return an ? 1 : -1;
      if (!an) c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (f.sort === 'title') c = a.title.localeCompare(b.title, 'vi');
    else c = a[f.sort] < b[f.sort] ? -1 : a[f.sort] > b[f.sort] ? 1 : 0;
    return c * dir || idNum(a) - idNum(b);
  });
}

const COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];
const FORMULA = /^[=+\-@\t\r]/;
const NEEDS_QUOTE = /[",\r\n]/;
function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && FORMULA.test(s)) s = "'" + s;
  return NEEDS_QUOTE.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(items) {
  const lines = [COLS.join(','), ...items.map((t) => COLS.map((c) => cell(t[c])).join(','))];
  return '﻿' + lines.map((l) => l + '\r\n').join('');
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

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, query: qs }) => {
    const user = authenticate(req, store);
    const f = parseQuery(qs, { paging: true });
    const all = query(store, user, f);
    const items = all.slice((f.page - 1) * f.pageSize, f.page * f.pageSize);
    send(res, 200, { items, total: all.length, page: f.page, pageSize: f.pageSize });
  });

  // phải đăng ký trước '/tasks/:id'
  router.route('GET', '/tasks/export.csv', ({ req, res, query: qs }) => {
    const user = authenticate(req, store);
    const f = parseQuery(qs, { paging: false });
    send(res, 200, toCsv(query(store, user, f)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  const visible = (user, id) => {
    const t = store.getTask(id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw notFound();
    return t;
  };

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    send(res, 200, visible(user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    if (user.role === 'member') throw forbidden();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.addAudit({ userId: user.id, action: 'create', taskId: t.id, changes: Object.keys(body).sort() });
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = visible(user, params.id);
    const body = await readJson(req);
    if (user.role === 'member') {
      if (t.assignee !== user.id || Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    } else if (user.role === 'manager') {
      if (t.team !== user.team || (body.team !== undefined && body.team !== user.team)) throw forbidden();
    }
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]).sort();
    const updated = store.updateTask(params.id, body);
    store.addAudit({ userId: user.id, action: 'update', taskId: t.id, changes });
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    visible(user, params.id);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.addAudit({ userId: user.id, action: 'delete', taskId: params.id, changes: [] });
    send(res, 204);
  });
}

module.exports = { register, authenticate, forbidden, badQuery, STATUSES, FIELDS };
