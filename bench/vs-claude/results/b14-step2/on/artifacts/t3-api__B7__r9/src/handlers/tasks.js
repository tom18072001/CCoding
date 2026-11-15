'use strict';
const { HttpError, send, readJson } = require('../http');

const STATUSES = ['todo', 'doing', 'done'];
const FIELDS = ['title', 'status', 'priority', 'assignee', 'team', 'dueDate'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
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

function forbidden() {
  return new HttpError(403, 'FORBIDDEN', 'Không đủ quyền');
}
function notFound() {
  return new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
}
function badQuery(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

/** Bọc handler: yêu cầu header X-User hợp lệ, gắn ctx.user. */
function authed(store, handler) {
  return (ctx) => {
    const id = ctx.req.headers['x-user'];
    const user = typeof id === 'string' ? store.user(id) : undefined;
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
    return handler({ ...ctx, user });
  };
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function idNum(id) {
  return Number(String(id).replace(/\D/g, '')) || 0;
}

/** Phân tích query theo thứ tự xuất hiện trên URL. allowPaging=false cho export. */
function parseQuery(searchParams, allowPaging) {
  const allowed = allowPaging ? LIST_PARAMS : LIST_PARAMS.filter((p) => p !== 'page' && p !== 'pageSize');
  const seen = new Set();
  const q = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  for (const [k, v] of searchParams.entries()) {
    if (!allowed.includes(k) || seen.has(k)) throw badQuery(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const vals = v.split(',');
        if (!vals.every((s) => STATUSES.includes(s))) throw badQuery(k);
        q.status = vals;
        break;
      }
      case 'assignee':
        q.assignee = v;
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw badQuery(k);
        q.team = v;
        break;
      case 'q':
        q.q = fold(v);
        break;
      case 'dueBefore':
        if (!validDate(v)) throw badQuery(k);
        q.dueBefore = v;
        break;
      case 'sort': {
        const desc = v.startsWith('-');
        const f = desc ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw badQuery(k);
        q.sort = f;
        q.desc = desc;
        break;
      }
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1 || !Number.isSafeInteger(Number(v))) throw badQuery(k);
        q.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw badQuery(k);
        q.pageSize = Number(v);
        break;
    }
  }
  return q;
}

function selectTasks(store, user, q) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (q.status) items = items.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee === null : t.assignee === q.assignee));
  if (q.team) items = items.filter((t) => t.team === q.team);
  if (q.q) items = items.filter((t) => fold(t.title).includes(q.q));
  if (q.dueBefore) items = items.filter((t) => t.dueDate != null && t.dueDate <= q.dueBefore);
  const dir = q.desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    if (q.sort === 'dueDate') {
      if (a.dueDate == null || b.dueDate == null) {
        if (a.dueDate == null && b.dueDate == null) return idNum(a.id) - idNum(b.id);
        return a.dueDate == null ? 1 : -1;
      }
      c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (q.sort === 'title') c = a.title.localeCompare(b.title, 'vi');
    else if (q.sort === 'priority') c = a.priority - b.priority;
    else c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    return c !== 0 ? c * dir : idNum(a.id) - idNum(b.id);
  };
  return items.sort(cmp);
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(items) {
  const lines = [CSV_COLUMNS.join(','), ...items.map((t) => CSV_COLUMNS.map((c) => csvCell(t[c])).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function canRead(user, task) {
  return user.role !== 'member' || task.team === user.team;
}

async function tryReadJson(req) {
  try {
    return { body: await readJson(req) };
  } catch (e) {
    return { err: e };
  }
}

function register(router, store) {
  router.route('GET', '/tasks', authed(store, ({ res, query, user }) => {
    const q = parseQuery(query, true);
    const all = selectTasks(store, user, q);
    const items = all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    send(res, 200, { items, total: all.length, page: q.page, pageSize: q.pageSize });
  }));

  router.route('GET', '/tasks/export.csv', authed(store, ({ res, query, user }) => {
    const q = parseQuery(query, false);
    send(res, 200, toCsv(selectTasks(store, user, q)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  }));

  router.route('GET', '/tasks/:id', authed(store, ({ res, params, user }) => {
    const t = store.getTask(params.id);
    if (!t || !canRead(user, t)) throw notFound();
    send(res, 200, t);
  }));

  router.route('POST', '/tasks', authed(store, async ({ req, res, user }) => {
    const { body, err } = await tryReadJson(req);
    if (user.role === 'member') throw forbidden();
    if (user.role === 'manager' && body && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (err) throw err;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.addAudit(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  }));

  router.route('PATCH', '/tasks/:id', authed(store, async ({ req, res, params, user }) => {
    const t = store.getTask(params.id);
    if (!t || !canRead(user, t)) throw notFound();
    const { body, err } = await tryReadJson(req);
    if (user.role === 'manager') {
      if (t.team !== user.team) throw forbidden();
      if (body && body.team !== undefined && body.team !== user.team) throw forbidden();
    } else if (user.role === 'member') {
      if (t.assignee !== user.id) throw forbidden();
      if (body && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    }
    if (err) throw err;
    validate(body, store, { partial: true });
    const changed = Object.keys(body).filter((k) => t[k] !== body[k]);
    const out = store.updateTask(params.id, body);
    store.addAudit(user.id, 'update', t.id, changed);
    send(res, 200, out);
  }));

  router.route('DELETE', '/tasks/:id', authed(store, ({ res, params, user }) => {
    const t = store.getTask(params.id);
    if (!t || !canRead(user, t)) throw notFound();
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.addAudit(user.id, 'delete', params.id, []);
    send(res, 204);
  }));

  router.route('GET', '/audit', authed(store, ({ res, query, user }) => {
    const seen = new Set();
    let taskId;
    for (const [k, v] of query.entries()) {
      if (k !== 'taskId' || seen.has(k)) throw badQuery(k);
      seen.add(k);
      taskId = v;
    }
    if (user.role !== 'admin') throw forbidden();
    let items = [...store.audit].reverse();
    if (taskId !== undefined) items = items.filter((e) => e.taskId === taskId);
    send(res, 200, { items });
  }));
}

module.exports = { register, STATUSES, FIELDS };
