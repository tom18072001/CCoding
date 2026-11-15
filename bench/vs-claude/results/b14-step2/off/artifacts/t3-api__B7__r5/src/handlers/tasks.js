'use strict';
const { HttpError, send, readJson } = require('../http');
const { authenticate, forbidden } = require('../auth');

const STATUSES = ['todo', 'doing', 'done'];
const FIELDS = ['title', 'status', 'priority', 'assignee', 'team', 'dueDate'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const FILTER_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];
const CSV_COLUMNS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

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

function invalidQuery(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
}

/** Phân tích query theo thứ tự xuất hiện; paging=false → page/pageSize bị cấm. */
function parseQuery(query, { paging }) {
  const q = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  const seen = new Set();
  for (const [k, v] of query) {
    const known = FILTER_PARAMS.includes(k) || (paging && (k === 'page' || k === 'pageSize'));
    if (!known || seen.has(k)) throw invalidQuery(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw invalidQuery(k);
        q.status = parts;
        break;
      }
      case 'assignee':
        q.assignee = v;
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw invalidQuery(k);
        q.team = v;
        break;
      case 'q':
        q.q = fold(v);
        break;
      case 'dueBefore':
        if (!isRealDate(v)) throw invalidQuery(k);
        q.dueBefore = v;
        break;
      case 'sort': {
        const desc = v.startsWith('-');
        const f = desc ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw invalidQuery(k);
        q.sort = f;
        q.desc = desc;
        break;
      }
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1) throw invalidQuery(k);
        q.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw invalidQuery(k);
        q.pageSize = Number(v);
        break;
    }
  }
  return q;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function selectTasks(store, user, q) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (q.status) items = items.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee == null : t.assignee === q.assignee));
  if (q.team) items = items.filter((t) => t.team === q.team);
  if (q.q) items = items.filter((t) => fold(t.title).includes(q.q));
  if (q.dueBefore) items = items.filter((t) => t.dueDate != null && t.dueDate <= q.dueBefore);
  const dir = q.desc ? -1 : 1;
  const cmp = (a, b) => {
    let r = 0;
    if (q.sort === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) {
        if (an && bn) return idNum(a) - idNum(b);
        return an ? 1 : -1;
      }
      r = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (q.sort === 'title') r = a.title.localeCompare(b.title, 'vi');
    else if (q.sort === 'priority') r = a.priority - b.priority;
    else r = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    return r * dir || idNum(a) - idNum(b);
  };
  return items.sort(cmp);
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[,"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(items) {
  const lines = [CSV_COLUMNS.join(','), ...items.map((t) => CSV_COLUMNS.map((c) => csvCell(t[c])).join(','))];
  return '﻿' + lines.map((l) => l + '\r\n').join('');
}

function canRead(user, task) {
  return user.role !== 'member' || task.team === user.team;
}

function changedFields(body, old) {
  return Object.keys(body).filter((k) => body[k] !== old[k]).sort();
}

function register(router, store) {
  // export.csv phải đăng ký trước /tasks/:id
  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, { paging: false });
    const items = selectTasks(store, user, q);
    send(res, 200, toCsv(items), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, { paging: true });
    const all = selectTasks(store, user, q);
    const start = (q.page - 1) * q.pageSize;
    send(res, 200, { items: all.slice(start, start + q.pageSize), total: all.length, page: q.page, pageSize: q.pageSize });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || !canRead(user, t)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    send(res, 200, t);
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
    const t = store.getTask(params.id);
    if (!t || !canRead(user, t)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    if (user.role === 'manager' && t.team !== user.team) throw forbidden();
    if (user.role === 'member' && t.assignee !== user.id) throw forbidden();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (user.role === 'member' && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    validate(body, store, { partial: true });
    const changes = changedFields(body, t);
    const updated = store.updateTask(params.id, body);
    store.logAudit(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || !canRead(user, t)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.logAudit(user.id, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
