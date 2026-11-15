'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function auth(store, req) {
  const u = store.user(req.headers['x-user']);
  if (!u) throw new HttpError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
  return u;
}

const badQuery = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function intIn(s, lo, hi) {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= lo && n <= hi ? n : null;
}

/** Phân tích query theo thứ tự xuất hiện; lỗi đầu tiên được báo. */
function parseQuery(params, { paged = false, audit = false, none = false } = {}) {
  const allowed = none ? [] : audit ? ['taskId'] : ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', ...(paged ? ['page', 'pageSize'] : [])];
  const q = { page: 1, pageSize: 20, sort: 'createdAt' };
  const seen = new Set();
  for (const [k, v] of params) {
    if (!allowed.includes(k) || seen.has(k)) throw badQuery(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const vals = v.split(',');
        if (!vals.every((x) => STATUSES.includes(x))) throw badQuery(k);
        q.status = vals;
        break;
      }
      case 'team':
        if (!['A', 'B'].includes(v)) throw badQuery(k);
        q.team = v;
        break;
      case 'dueBefore':
        if (!validDate(v)) throw badQuery(k);
        q.dueBefore = v;
        break;
      case 'sort':
        if (!SORTS.includes(v.replace(/^-/, ''))) throw badQuery(k);
        q.sort = v;
        break;
      case 'page':
      case 'pageSize': {
        const n = k === 'page' ? intIn(v, 1, Infinity) : intIn(v, 1, 100);
        if (n === null) throw badQuery(k);
        q[k] = n;
        break;
      }
      default:
        q[k] = v;
    }
  }
  return q;
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

const num = (id) => Number(String(id).replace(/\D/g, ''));

function filterSort(tasks, q, user) {
  let r = tasks;
  if (user.role === 'member') r = r.filter((t) => t.team === user.team);
  if (q.status) r = r.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) r = r.filter((t) => (q.assignee === 'none' ? t.assignee == null : t.assignee === q.assignee));
  if (q.team) r = r.filter((t) => t.team === q.team);
  if (q.q) {
    const n = fold(q.q);
    r = r.filter((t) => fold(t.title).includes(n));
  }
  if (q.dueBefore) r = r.filter((t) => t.dueDate != null && t.dueDate <= q.dueBefore);
  const f = q.sort.replace(/^-/, '');
  const dir = q.sort.startsWith('-') ? -1 : 1;
  const cmp = (a, b) => {
    if (f === 'dueDate' && (a.dueDate == null || b.dueDate == null)) {
      if (a.dueDate == null && b.dueDate == null) return num(a.id) - num(b.id);
      return a.dueDate == null ? 1 : -1;
    }
    const c = f === 'title' ? a.title.localeCompare(b.title, 'vi') : a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : 0;
    return c * dir || num(a.id) - num(b.id);
  };
  return r.slice().sort(cmp);
}

const COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(tasks) {
  return '﻿' + [COLS.join(','), ...tasks.map((t) => COLS.map((c) => cell(t[c])).join(','))].map((l) => l + '\r\n').join('');
}

module.exports = { auth, parseQuery, filterSort, toCsv };
