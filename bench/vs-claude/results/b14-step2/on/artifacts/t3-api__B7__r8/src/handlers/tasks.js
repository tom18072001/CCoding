'use strict';
const { HttpError, send, readJson } = require('../http');

const STATUSES = ['todo', 'doing', 'done'];
const FIELDS = ['title', 'status', 'priority', 'assignee', 'team', 'dueDate'];
const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const FILTER_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
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

const invalidQuery = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số truy vấn không hợp lệ: ${field}`, { field });

function isCalendarDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function fold(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

/** Kiểm tra tham số truy vấn theo thứ tự xuất hiện trên URL; trả về Map tên → giá trị. */
function parseQuery(searchParams, allowed) {
  const counts = new Map();
  for (const [k] of searchParams) counts.set(k, (counts.get(k) || 0) + 1);
  const out = new Map();
  for (const [k, v] of searchParams) {
    if (out.has(k)) continue;
    if (!allowed.includes(k) || counts.get(k) > 1) throw invalidQuery(k);
    switch (k) {
      case 'status':
        if (!v.split(',').every((x) => STATUSES.includes(x))) throw invalidQuery(k);
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw invalidQuery(k);
        break;
      case 'dueBefore':
        if (!isCalendarDate(v)) throw invalidQuery(k);
        break;
      case 'sort':
        if (!SORTS.includes(v.startsWith('-') ? v.slice(1) : v)) throw invalidQuery(k);
        break;
      case 'page':
        if (!/^[1-9]\d*$/.test(v) || !Number.isSafeInteger(Number(v))) throw invalidQuery(k);
        break;
      case 'pageSize':
        if (!/^[1-9]\d*$/.test(v) || Number(v) > 100) throw invalidQuery(k);
        break;
      default:
    }
    out.set(k, v);
  }
  return out;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function queryTasks(store, user, q) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (q.has('status')) {
    const set = q.get('status').split(',');
    items = items.filter((t) => set.includes(t.status));
  }
  if (q.has('assignee')) {
    const a = q.get('assignee');
    items = items.filter((t) => (a === 'none' ? t.assignee === null || t.assignee === undefined : t.assignee === a));
  }
  if (q.has('team')) items = items.filter((t) => t.team === q.get('team'));
  if (q.get('q')) {
    const needle = fold(q.get('q'));
    items = items.filter((t) => fold(String(t.title)).includes(needle));
  }
  if (q.has('dueBefore')) items = items.filter((t) => t.dueDate && t.dueDate <= q.get('dueBefore'));
  const sort = q.get('sort') || 'createdAt';
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    let c;
    if (field === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) return an && bn ? idNum(a) - idNum(b) : an ? 1 : -1;
    }
    if (field === 'title') c = String(a.title).localeCompare(String(b.title), 'vi');
    else c = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
    return c * dir || idNum(a) - idNum(b);
  };
  return items.slice().sort(cmp);
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(items) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const t of items) lines.push(CSV_COLUMNS.map((c) => csvCell(t[c])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Không có quyền thực hiện');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');

async function safeBody(req) {
  try {
    return { body: await readJson(req) };
  } catch (err) {
    return { body: {}, err };
  }
}

function register(router, store) {
  /** Bọc handler: xác thực X-User (401) trước mọi thứ. */
  const authed = (fn) => (ctx) => {
    const id = ctx.req.headers['x-user'];
    const user = typeof id === 'string' ? store.user(id) : undefined;
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
    return fn({ ...ctx, user });
  };
  const visible = (user, t) => t && !(user.role === 'member' && t.team !== user.team);

  router.route('GET', '/tasks', authed(({ res, query, user }) => {
    const q = parseQuery(query, LIST_PARAMS);
    const all = queryTasks(store, user, q);
    const page = q.has('page') ? Number(q.get('page')) : 1;
    const pageSize = q.has('pageSize') ? Number(q.get('pageSize')) : 20;
    const items = all.slice((page - 1) * pageSize, page * pageSize);
    send(res, 200, { items, total: all.length, page, pageSize });
  }));

  router.route('GET', '/tasks/export.csv', authed(({ res, query, user }) => {
    const q = parseQuery(query, FILTER_PARAMS);
    send(res, 200, toCsv(queryTasks(store, user, q)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  }));

  router.route('GET', '/audit', authed(({ res, query, user }) => {
    parseQuery(query, ['taskId']);
    if (user.role !== 'admin') throw forbidden();
    let items = store.audit.slice().reverse();
    if (query.has('taskId')) items = items.filter((e) => e.taskId === query.get('taskId'));
    send(res, 200, { items });
  }));

  router.route('GET', '/tasks/:id', authed(({ res, params, user }) => {
    const t = store.getTask(params.id);
    if (!visible(user, t)) throw notFound();
    send(res, 200, t);
  }));

  router.route('POST', '/tasks', authed(async ({ req, res, user }) => {
    const { body, err } = await safeBody(req);
    if (user.role === 'member') throw forbidden();
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (err) throw err;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.log(user.id, 'create', t.id, Object.keys(body).sort());
    send(res, 201, t);
  }));

  router.route('PATCH', '/tasks/:id', authed(async ({ req, res, params, user }) => {
    const t = store.getTask(params.id);
    if (!visible(user, t)) throw notFound();
    const { body, err } = await safeBody(req);
    if (user.role === 'manager') {
      if (t.team !== user.team) throw forbidden();
      if (body.team !== undefined && body.team !== user.team) throw forbidden();
    } else if (user.role === 'member') {
      if (t.assignee !== user.id || Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    }
    if (err) throw err;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]).sort();
    const updated = store.updateTask(params.id, body);
    store.log(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  }));

  router.route('DELETE', '/tasks/:id', authed(({ res, params, user }) => {
    const t = store.getTask(params.id);
    if (!visible(user, t)) throw notFound();
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.log(user.id, 'delete', t.id, []);
    send(res, 204);
  }));
}

module.exports = { register, STATUSES, FIELDS };
