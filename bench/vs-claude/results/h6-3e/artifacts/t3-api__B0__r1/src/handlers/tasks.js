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

const isDate = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const isInt = (v, lo, hi) => /^\d{1,15}$/.test(v) && Number(v) >= lo && Number(v) <= hi;
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const FILTER_RULES = {
  status: (v) => v.split(',').every((x) => STATUSES.includes(x)),
  assignee: () => true,
  team: (v) => v === 'A' || v === 'B',
  q: () => true,
  dueBefore: isDate,
  sort: (v) => SORTS.includes(v.startsWith('-') ? v.slice(1) : v),
};
const PAGE_RULES = { page: (v) => isInt(v, 1, Infinity), pageSize: (v) => isInt(v, 1, 100) };

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

/** Lọc + sắp xếp theo quyền người dùng; trả về mảng nhiệm vụ. */
function select(store, user, q) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (q.status) {
    const st = q.status.split(',');
    items = items.filter((t) => st.includes(t.status));
  }
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee == null : t.assignee === q.assignee));
  if (q.team) items = items.filter((t) => t.team === q.team);
  if (q.q) {
    const n = fold(q.q);
    items = items.filter((t) => fold(t.title).includes(n));
  }
  if (q.dueBefore) items = items.filter((t) => t.dueDate && t.dueDate <= q.dueBefore);
  const sort = q.sort || 'createdAt';
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    if (key === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) return an && bn ? idNum(a) - idNum(b) : an ? 1 : -1; // thiếu dueDate luôn cuối
      c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (key === 'title') c = a.title.localeCompare(b.title, 'vi');
    else if (key === 'priority') c = a.priority - b.priority;
    else c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    return c * dir || idNum(a) - idNum(b);
  };
  return items.sort(cmp);
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[,"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const CSV_COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

/** Đọc body nhưng hoãn lỗi JSON tới bước validate (sau kiểm tra quyền). */
async function softJson(req) {
  try {
    return { body: await readJson(req) };
  } catch (e) {
    return { error: e };
  }
}

function register(router, store) {
  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, { ...FILTER_RULES, ...PAGE_RULES });
    const all = select(store, user, q);
    const page = q.page ? Number(q.page) : 1;
    const pageSize = q.pageSize ? Number(q.pageSize) : 20;
    send(res, 200, { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const q = parseQuery(query, FILTER_RULES);
    const rows = select(store, user, q).map((t) => CSV_COLS.map((c) => csvCell(t[c])).join(',') + '\r\n');
    const text = '﻿' + CSV_COLS.join(',') + '\r\n' + rows.join('');
    send(res, 200, text, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="tasks.csv"' });
  });

  const readable = (user, t) => {
    if (!t || (user.role === 'member' && t.team !== user.team)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
  };

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    readable(user, t);
    send(res, 200, t);
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    if (user.role === 'member') throw forbidden();
    const r = await softJson(req);
    if (user.role === 'manager' && r.body && r.body.team !== undefined && r.body.team !== user.team) throw forbidden();
    if (r.error) throw r.error;
    const body = r.body;
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.logAudit(user.id, 'create', t.id, Object.keys(body));
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    readable(user, t);
    const r = await softJson(req);
    if (user.role === 'manager') {
      if (t.team !== user.team) throw forbidden();
      if (r.body && r.body.team !== undefined && r.body.team !== user.team) throw forbidden();
    } else if (user.role === 'member') {
      if (t.assignee !== user.id) throw forbidden();
      if (r.body && Object.keys(r.body).some((k) => k !== 'status')) throw forbidden();
    }
    if (r.error) throw r.error;
    const body = r.body;
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]);
    const out = store.updateTask(params.id, body);
    store.logAudit(user.id, 'update', t.id, changes);
    send(res, 200, out);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = store.getTask(params.id);
    readable(user, t);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.logAudit(user.id, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
