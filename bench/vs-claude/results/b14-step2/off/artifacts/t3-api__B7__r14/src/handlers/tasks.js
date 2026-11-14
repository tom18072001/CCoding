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

const QUERY_KEYS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const CSV_COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

const forbid = () => new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Duyệt tham số theo thứ tự trên URL; lỗi đầu tiên được báo. */
function parseQuery(searchParams, allowed) {
  const out = {};
  for (const [k, v] of searchParams) {
    if (!allowed.includes(k) || k in out) throw bad(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((x) => STATUSES.includes(x))) throw bad(k);
        out.status = parts;
        break;
      }
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        out.team = v;
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        out.dueBefore = v;
        break;
      case 'sort':
        if (!SORTS.includes(v.replace(/^-/, ''))) throw bad(k);
        out.sort = v;
        break;
      case 'page':
        if (!/^[0-9]+$/.test(v) || Number(v) < 1) throw bad(k);
        out.page = Number(v);
        break;
      case 'pageSize':
        if (!/^[0-9]+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k);
        out.pageSize = Number(v);
        break;
      default:
        out[k] = v;
    }
  }
  return out;
}

function fold(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function queryTasks(store, user, q) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (q.status) items = items.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee == null : t.assignee === q.assignee));
  if (q.team) items = items.filter((t) => t.team === q.team);
  if (q.q) {
    const needle = fold(q.q);
    items = items.filter((t) => fold(String(t.title)).includes(needle));
  }
  if (q.dueBefore) items = items.filter((t) => t.dueDate && t.dueDate <= q.dueBefore);
  const sort = q.sort || 'createdAt';
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    if (field === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) c = an && bn ? 0 : an ? 1 : -1; // null luôn cuối, không đảo theo chiều
      else c = (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) * dir;
    } else if (field === 'title') c = String(a.title).localeCompare(String(b.title), 'vi') * dir;
    else c = (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * dir;
    return c || idNum(a) - idNum(b);
  };
  return items.sort(cmp);
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(items) {
  const rows = [CSV_COLS.join(','), ...items.map((t) => CSV_COLS.map((c) => csvCell(t[c])).join(','))];
  return '﻿' + rows.join('\r\n') + '\r\n';
}

function register(router, store) {
  const audit = (user, action, taskId, changes) =>
    store.addAudit({ at: store.now().toISOString(), userId: user.id, action, taskId, changes: [...changes].sort() });

  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, QUERY_KEYS);
    const items = queryTasks(store, user, q);
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    send(res, 200, { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, QUERY_KEYS.filter((k) => k !== 'page' && k !== 'pageSize'));
    send(res, 200, toCsv(queryTasks(store, user, q)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/audit', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, ['taskId']);
    if (user.role !== 'admin') throw forbid();
    let items = store.audit.slice();
    if (q.taskId !== undefined) items = items.filter((e) => e.taskId === q.taskId);
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
    if (user.role === 'member') throw forbid();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbid();
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    audit(user, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw notFound();
    if (user.role === 'manager' && t.team !== user.team) throw forbid();
    if (user.role === 'member' && t.assignee !== user.id) throw forbid();
    const body = await readJson(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbid();
    if (user.role === 'member' && Object.keys(body).some((k) => k !== 'status')) throw forbid();
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    audit(user, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw notFound();
    if (user.role !== 'admin') throw forbid();
    store.deleteTask(params.id);
    audit(user, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
