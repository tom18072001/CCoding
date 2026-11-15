'use strict';
const { HttpError, send, readJson } = require('../http');
const { authenticate, forbidden, parseQuery } = require('../auth');

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

const ok = (value) => ({ ok: true, value });
const NO = { ok: false };
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
const isDate = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const intIn = (min, max) => (v) => {
  if (!/^\d+$/.test(v)) return NO;
  const n = Number(v);
  return n >= min && n <= max ? ok(n) : NO;
};

const FILTER_SPEC = {
  status: (v) => {
    const parts = v.split(',');
    return parts.every((x) => STATUSES.includes(x)) ? ok(parts) : NO;
  },
  assignee: (v) => (v ? ok(v) : NO),
  team: (v) => (v === 'A' || v === 'B' ? ok(v) : NO),
  q: (v) => ok(v),
  dueBefore: (v) => (isDate(v) ? ok(v) : NO),
  sort: (v) => (SORTS.includes(v.replace(/^-/, '')) ? ok(v) : NO),
};
const LIST_SPEC = { ...FILTER_SPEC, page: intIn(1, Number.MAX_SAFE_INTEGER), pageSize: intIn(1, 100) };

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function selectTasks(store, user, q) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (q.status) items = items.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee == null : t.assignee === q.assignee));
  if (q.team) items = items.filter((t) => t.team === q.team);
  if (q.q) {
    const needle = strip(q.q);
    items = items.filter((t) => strip(String(t.title)).includes(needle));
  }
  if (q.dueBefore) items = items.filter((t) => t.dueDate != null && t.dueDate <= q.dueBefore);
  const sort = q.sort || 'createdAt';
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const dir = desc ? -1 : 1;
  const cmpVal = (a, b) => {
    if (field === 'title') return String(a.title).localeCompare(String(b.title), 'vi');
    const x = a[field];
    const y = b[field];
    return x < y ? -1 : x > y ? 1 : 0;
  };
  items.sort((a, b) => {
    if (field === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an !== bn) return an ? 1 : -1;
      if (an && bn) return idNum(a) - idNum(b);
    }
    const c = cmpVal(a, b) * dir;
    return c || idNum(a) - idNum(b);
  });
  return items;
}

const CSV_COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];
function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Lấy nhiệm vụ để đọc: member không thấy nhóm khác → 404. */
function readable(store, user, id) {
  const t = store.getTask(id);
  if (!t || (user.role === 'member' && t.team !== user.team)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
  return t;
}

/** Đọc body nhưng hoãn lỗi JSON tới sau bước kiểm tra quyền. */
async function lazyBody(req) {
  try {
    return { body: await readJson(req) };
  } catch (err) {
    return { body: {}, err };
  }
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, LIST_SPEC);
    const items = selectTasks(store, user, q);
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    send(res, 200, { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, FILTER_SPEC);
    const rows = selectTasks(store, user, q).map((t) => CSV_COLS.map((c) => csvCell(t[c])).join(','));
    const text = '﻿' + [CSV_COLS.join(','), ...rows].join('\r\n') + '\r\n';
    send(res, 200, text, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="tasks.csv"' });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    send(res, 200, readable(store, user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    if (user.role === 'member') throw forbidden();
    const { body, err } = await lazyBody(req);
    if (user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (err) throw err;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.logAudit(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = readable(store, user, params.id);
    const { body, err } = await lazyBody(req);
    if (user.role === 'manager') {
      if (t.team !== user.team) throw forbidden();
      if (body.team !== undefined && body.team !== user.team) throw forbidden();
    } else if (user.role === 'member') {
      if (t.assignee !== user.id || Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    }
    if (err) throw err;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    store.logAudit(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    readable(store, user, params.id);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.logAudit(user.id, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
