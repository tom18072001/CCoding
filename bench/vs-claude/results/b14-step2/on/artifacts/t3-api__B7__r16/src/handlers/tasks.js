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
const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

/** Phân tích query theo thứ tự xuất hiện trên URL; báo lỗi tham số đầu tiên. */
function parseQuery(query, allowed) {
  const q = {};
  const seen = new Set();
  for (const [k, v] of query.entries()) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((x) => STATUSES.includes(x))) throw bad(k);
        q.status = parts;
        break;
      }
      case 'assignee':
        if (v === '') throw bad(k);
        q.assignee = v;
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        q.team = v;
        break;
      case 'q':
        q.q = fold(v);
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        q.dueBefore = v;
        break;
      case 'sort':
        if (!SORTS.includes(v.replace(/^-/, ''))) throw bad(k);
        q.sort = v;
        break;
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1 || !Number.isSafeInteger(Number(v))) throw bad(k);
        q.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k);
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
  const sort = q.sort || 'createdAt';
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    let r;
    if (field === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) return an && bn ? idNum(a) - idNum(b) : an ? 1 : -1;
      r = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (field === 'title') r = String(a.title).localeCompare(String(b.title), 'vi');
    else r = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
    return r * dir || idNum(a) - idNum(b);
  };
  return items.sort(cmp);
}

const CSV_COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];
function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** member chỉ thấy nhiệm vụ nhóm mình; ngược lại coi như không tồn tại. */
function readable(user, t) {
  return !!t && !(user.role === 'member' && t.team !== user.team);
}

async function tryBody(req) {
  try {
    return { body: await readJson(req) };
  } catch (e) {
    return { err: e };
  }
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, LIST_PARAMS);
    const items = selectTasks(store, user, q);
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    send(res, 200, { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, LIST_PARAMS.filter((k) => k !== 'page' && k !== 'pageSize'));
    const rows = selectTasks(store, user, q).map((t) => CSV_COLS.map((c) => csvCell(t[c])).join(',') + '\r\n');
    const text = '﻿' + CSV_COLS.join(',') + '\r\n' + rows.join('');
    send(res, 200, text, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="tasks.csv"' });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!readable(user, t)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    send(res, 200, t);
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    if (user.role === 'member') throw forbidden();
    const { body, err } = await tryBody(req);
    if (body && user.role === 'manager' && body.team !== undefined && body.team !== user.team) throw forbidden();
    if (err) throw err;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.log(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!readable(user, t)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    const { body, err } = await tryBody(req);
    if (user.role === 'manager') {
      if (t.team !== user.team) throw forbidden();
      if (body && body.team !== undefined && body.team !== user.team) throw forbidden();
    } else if (user.role === 'member') {
      if (t.assignee !== user.id) throw forbidden();
      if (body && Object.keys(body).some((k) => k !== 'status')) throw forbidden();
    }
    if (err) throw err;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const updated = store.updateTask(params.id, body);
    store.log(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    if (!readable(user, t)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.log(user.id, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
