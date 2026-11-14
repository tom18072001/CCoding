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

function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

const isInt = (s) => /^\d+$/.test(s);
function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1;
}

/** Phân tích tham số truy vấn theo thứ tự xuất hiện; lỗi đầu tiên → 400. */
function parseQuery(searchParams, { paging }) {
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', ...(paging ? ['page', 'pageSize'] : [])];
  const seen = new Set();
  const o = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  for (const [k, v] of searchParams) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    if (k === 'status') {
      const parts = v.split(',');
      if (!parts.every((s) => STATUSES.includes(s))) throw bad(k);
      o.status = parts;
    } else if (k === 'assignee') o.assignee = v;
    else if (k === 'team') {
      if (!['A', 'B'].includes(v)) throw bad(k);
      o.team = v;
    } else if (k === 'q') o.q = v;
    else if (k === 'dueBefore') {
      if (!validDate(v)) throw bad(k);
      o.dueBefore = v;
    } else if (k === 'sort') {
      const name = v.startsWith('-') ? v.slice(1) : v;
      if (!['createdAt', 'dueDate', 'priority', 'title'].includes(name)) throw bad(k);
      o.sort = name;
      o.desc = v.startsWith('-');
    } else if (k === 'page') {
      if (!isInt(v) || Number(v) < 1) throw bad(k);
      o.page = Number(v);
    } else if (k === 'pageSize') {
      if (!isInt(v) || Number(v) < 1 || Number(v) > 100) throw bad(k);
      o.pageSize = Number(v);
    }
  }
  return o;
}

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd');
const num = (id) => Number(String(id).replace(/\D/g, '')) || 0;

function selectTasks(store, user, o) {
  const q = o.q ? fold(o.q) : '';
  let items = store.listTasks().filter((t) => {
    if (user.role === 'member' && t.team !== user.team) return false;
    if (o.status && !o.status.includes(t.status)) return false;
    if (o.assignee !== undefined && (o.assignee === 'none' ? t.assignee !== null : t.assignee !== o.assignee)) return false;
    if (o.team && t.team !== o.team) return false;
    if (q && !fold(t.title).includes(q)) return false;
    if (o.dueBefore && !(t.dueDate && t.dueDate <= o.dueBefore)) return false;
    return true;
  });
  const dir = o.desc ? -1 : 1;
  items = items.sort((a, b) => {
    let c = 0;
    if (o.sort === 'dueDate') {
      if (a.dueDate == null || b.dueDate == null) {
        if (a.dueDate == null && b.dueDate == null) c = 0;
        else return a.dueDate == null ? 1 : -1;
      } else c = a.dueDate < b.dueDate ? -dir : a.dueDate > b.dueDate ? dir : 0;
    } else if (o.sort === 'title') c = dir * a.title.localeCompare(b.title, 'vi');
    else c = a[o.sort] < b[o.sort] ? -dir : a[o.sort] > b[o.sort] ? dir : 0;
    return c || num(a.id) - num(b.id);
  });
  return items;
}

const CSV_COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];
function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[,"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, url }) => {
    const user = authenticate(req, store);
    const o = parseQuery(url.searchParams, { paging: true });
    const all = selectTasks(store, user, o);
    const start = (o.page - 1) * o.pageSize;
    send(res, 200, { items: all.slice(start, start + o.pageSize), total: all.length, page: o.page, pageSize: o.pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, url }) => {
    const user = authenticate(req, store);
    const o = parseQuery(url.searchParams, { paging: false });
    const rows = selectTasks(store, user, o).map((t) => CSV_COLS.map((c) => csvCell(t[c])).join(','));
    const text = '﻿' + [CSV_COLS.join(','), ...rows].join('\r\n') + '\r\n';
    send(res, 200, text, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="tasks.csv"' });
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
    store.logAudit(user.id, 'update', params.id, changes);
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
    let taskId;
    const seen = new Set();
    for (const [k, v] of url.searchParams) {
      if (k !== 'taskId' || seen.has(k)) throw bad(k);
      seen.add(k);
      taskId = v;
    }
    if (user.role !== 'admin') throw forbidden();
    let items = [...store.audit].reverse();
    if (taskId !== undefined) items = items.filter((e) => e.taskId === taskId);
    send(res, 200, { items });
  });
}

module.exports = { register, STATUSES, FIELDS };
