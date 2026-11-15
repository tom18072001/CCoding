'use strict';
const { HttpError, send, readJson } = require('../http');

const STATUSES = ['todo', 'doing', 'done'];
const FIELDS = ['title', 'status', 'priority', 'assignee', 'team', 'dueDate'];
const QUERY_KEYS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

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

function auth(req, store) {
  const id = req.headers['x-user'];
  const u = id ? store.user(id) : undefined;
  if (!u) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return u;
}

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền');
const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function parseQuery(sp, { paged }) {
  const allowed = paged ? QUERY_KEYS : QUERY_KEYS.filter((k) => k !== 'page' && k !== 'pageSize');
  const seen = new Set();
  const o = {};
  for (const [k, v] of sp.entries()) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k);
        o.status = parts;
        break;
      }
      case 'team': if (!['A', 'B'].includes(v)) throw bad(k); o.team = v; break;
      case 'dueBefore': if (!validDate(v)) throw bad(k); o.dueBefore = v; break;
      case 'sort': if (!SORTS.includes(v.replace(/^-/, ''))) throw bad(k); o.sort = v; break;
      case 'page': if (!/^\d+$/.test(v) || Number(v) < 1) throw bad(k); o.page = Number(v); break;
      case 'pageSize': if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k); o.pageSize = Number(v); break;
      default: o[k] = v;
    }
  }
  return o;
}

const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const idNum = (t) => Number(String(t.id).replace(/\D/g, ''));

function queryTasks(store, user, o) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (o.status) items = items.filter((t) => o.status.includes(t.status));
  if (o.assignee !== undefined) items = items.filter((t) => (o.assignee === 'none' ? t.assignee == null : t.assignee === o.assignee));
  if (o.team) items = items.filter((t) => t.team === o.team);
  if (o.q) { const q = fold(o.q); items = items.filter((t) => fold(t.title).includes(q)); }
  if (o.dueBefore) items = items.filter((t) => t.dueDate != null && t.dueDate <= o.dueBefore);
  const sort = o.sort || 'createdAt';
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    let c;
    if (key === 'dueDate') {
      const an = a.dueDate == null, bn = b.dueDate == null;
      if (an || bn) return an && bn ? idNum(a) - idNum(b) : an ? 1 : -1;
      c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (key === 'title') c = a.title.localeCompare(b.title, 'vi');
    else c = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
    return c * dir || idNum(a) - idNum(b);
  };
  return items.sort(cmp);
}

const CSV_COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];
function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[,"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function readBody(req) {
  try { return { body: await readJson(req) }; } catch (e) { return { err: e }; }
}

function register(router, store) {
  const audit = (user, action, taskId, changes) =>
    store.addAudit({ userId: user.id, action, taskId, changes: [...changes].sort() });

  router.route('GET', '/tasks', ({ req, res, query: sp }) => {
    const user = auth(req, store);
    const o = parseQuery(sp, { paged: true });
    const all = queryTasks(store, user, o);
    const page = o.page || 1, pageSize = o.pageSize || 20;
    send(res, 200, { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, query: sp }) => {
    const user = auth(req, store);
    const o = parseQuery(sp, { paged: false });
    const rows = queryTasks(store, user, o).map((t) => CSV_COLS.map((c) => cell(t[c])).join(','));
    const text = '﻿' + [CSV_COLS.join(','), ...rows].join('\r\n') + '\r\n';
    send(res, 200, text, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="tasks.csv"' });
  });

  router.route('GET', '/audit', ({ req, res, query: sp }) => {
    const user = auth(req, store);
    const seen = new Set();
    let taskId;
    for (const [k, v] of sp.entries()) {
      if (k !== 'taskId' || seen.has(k)) throw bad(k);
      seen.add(k);
      taskId = v;
    }
    if (user.role !== 'admin') throw forbidden();
    let items = store.auditLog.slice().reverse();
    if (taskId !== undefined) items = items.filter((e) => e.taskId === taskId);
    send(res, 200, { items });
  });

  const visible = (user, id) => {
    const t = store.getTask(id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    return t;
  };

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = auth(req, store);
    send(res, 200, visible(user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = auth(req, store);
    const { body, err } = await readBody(req);
    if (user.role === 'member') throw forbidden();
    if (user.role === 'manager' && body && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (err) throw err;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    audit(user, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = auth(req, store);
    const t = visible(user, params.id);
    const { body, err } = await readBody(req);
    if (user.role === 'manager') {
      if (t.team !== user.team || (body && body.team !== undefined && body.team !== user.team)) throw forbidden();
    } else if (user.role === 'member') {
      if (t.assignee !== user.id || (body && Object.keys(body).some((k) => k !== 'status'))) throw forbidden();
    }
    if (err) throw err;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const out = store.updateTask(params.id, body);
    audit(user, 'update', t.id, changes);
    send(res, 200, out);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = auth(req, store);
    visible(user, params.id);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    audit(user, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
