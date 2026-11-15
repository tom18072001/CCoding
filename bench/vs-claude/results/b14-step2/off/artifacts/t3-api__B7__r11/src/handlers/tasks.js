'use strict';
const { HttpError, send, readJson } = require('../http');
const { authenticate, forbidden } = require('../auth');

const STATUSES = ['todo', 'doing', 'done'];
const FIELDS = ['title', 'status', 'priority', 'assignee', 'team', 'dueDate'];
const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const EXPORT_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const CSV_COLUMNS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
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

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

/** Chuẩn hóa để tìm kiếm: NFD, bỏ dấu kết hợp, đ → d, hạ chữ thường. */
function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
}

/** Phân tích tham số truy vấn theo thứ tự xuất hiện trên URL; lỗi đầu tiên được báo. */
function parseQuery(query, allowed) {
  const f = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  const seen = new Set();
  for (const [k, v] of query.entries()) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const vals = v.split(',');
        if (!vals.every((x) => STATUSES.includes(x))) throw bad(k);
        f.status = vals;
        break;
      }
      case 'assignee':
        f.assignee = v;
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        f.team = v;
        break;
      case 'q':
        f.q = fold(v);
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        f.dueBefore = v;
        break;
      case 'sort': {
        const desc = v.startsWith('-');
        const name = desc ? v.slice(1) : v;
        if (!SORTS.includes(name)) throw bad(k);
        f.sort = name;
        f.desc = desc;
        break;
      }
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1) throw bad(k);
        f.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k);
        f.pageSize = Number(v);
        break;
    }
  }
  return f;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function selectTasks(store, user, f) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (f.status) items = items.filter((t) => f.status.includes(t.status));
  if (f.assignee !== undefined) items = items.filter((t) => (f.assignee === 'none' ? t.assignee == null : t.assignee === f.assignee));
  if (f.team) items = items.filter((t) => t.team === f.team);
  if (f.q) items = items.filter((t) => fold(t.title).includes(f.q));
  if (f.dueBefore) items = items.filter((t) => t.dueDate != null && t.dueDate <= f.dueBefore);
  const dir = f.desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    if (f.sort === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) return an && bn ? idNum(a) - idNum(b) : an ? 1 : -1;
      c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (f.sort === 'title') c = a.title.localeCompare(b.title, 'vi');
    else c = a[f.sort] < b[f.sort] ? -1 : a[f.sort] > b[f.sort] ? 1 : 0;
    return c * dir || idNum(a) - idNum(b);
  };
  return items.sort(cmp);
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(items) {
  const lines = [CSV_COLUMNS.join(','), ...items.map((t) => CSV_COLUMNS.map((c) => csvCell(t[c])).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function register(router, store) {
  /** Nhiệm vụ mà user được thấy; member không thấy nhóm khác → 404. */
  const readable = (user, id) => {
    const t = store.getTask(id);
    if (!t || (user.role === 'member' && t.team !== user.team)) throw new HttpError(404, 'NOT_FOUND', 'Không có nhiệm vụ');
    return t;
  };
  // Đọc body nhưng hoãn lỗi JSON tới bước validate (sau các kiểm tra quyền).
  const readBody = async (req) => {
    try {
      return { body: await readJson(req) };
    } catch (e) {
      return { error: e };
    }
  };
  const unwrap = (r) => {
    if (r.error) throw r.error;
    return r.body;
  };

  router.route('GET', '/tasks', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const f = parseQuery(query, LIST_PARAMS);
    const all = selectTasks(store, user, f);
    const items = all.slice((f.page - 1) * f.pageSize, f.page * f.pageSize);
    send(res, 200, { items, total: all.length, page: f.page, pageSize: f.pageSize });
  });

  router.route('GET', '/tasks/export.csv', ({ req, res, query }) => {
    const user = authenticate(req, store);
    const f = parseQuery(query, EXPORT_PARAMS);
    send(res, 200, toCsv(selectTasks(store, user, f)), {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tasks.csv"',
    });
  });

  router.route('GET', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    send(res, 200, readable(user, params.id));
  });

  router.route('POST', '/tasks', async ({ req, res }) => {
    const user = authenticate(req, store);
    if (user.role === 'member') throw forbidden();
    const r = await readBody(req);
    if (user.role === 'manager' && !r.error && r.body.team !== undefined && r.body.team !== user.team) throw forbidden();
    const body = unwrap(r);
    validate(body, store, { partial: false });
    const t = store.createTask({ status: 'todo', priority: 2, assignee: null, dueDate: null, ...body });
    store.logAudit(user.id, 'create', t.id, Object.keys(body).sort());
    send(res, 201, t);
  });

  router.route('PATCH', '/tasks/:id', async ({ req, res, params }) => {
    const user = authenticate(req, store);
    const t = readable(user, params.id);
    const r = await readBody(req);
    if (user.role === 'manager') {
      if (t.team !== user.team) throw forbidden();
      if (!r.error && r.body.team !== undefined && r.body.team !== user.team) throw forbidden();
    } else if (user.role === 'member') {
      if (t.assignee !== user.id) throw forbidden();
      if (!r.error && Object.keys(r.body).some((k) => k !== 'status')) throw forbidden();
    }
    const body = unwrap(r);
    validate(body, store, { partial: true });
    const changes = Object.keys(body).filter((k) => body[k] !== t[k]).sort();
    const updated = store.updateTask(params.id, body);
    store.logAudit(user.id, 'update', t.id, changes);
    send(res, 200, updated);
  });

  router.route('DELETE', '/tasks/:id', ({ req, res, params }) => {
    const user = authenticate(req, store);
    readable(user, params.id);
    if (user.role !== 'admin') throw forbidden();
    store.deleteTask(params.id);
    store.logAudit(user.id, 'delete', params.id, []);
    send(res, 204);
  });
}

module.exports = { register, STATUSES, FIELDS };
