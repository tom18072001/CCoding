'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field, message) {
  return new HttpError(400, 'INVALID_QUERY', message || `Tham số không hợp lệ: ${field}`, { field });
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(2000, mo - 1, d));
  dt.setUTCFullYear(y);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Phân tích query; `allowed` là danh sách tên tham số được phép. Báo lỗi tham số đầu tiên theo thứ tự trên URL. */
function parseQuery(params, allowed) {
  const counts = new Map();
  const order = [];
  for (const [k] of params) {
    if (!counts.has(k)) order.push(k);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const out = {};
  for (const k of order) {
    if (!allowed.includes(k) || counts.get(k) > 1) throw bad(k);
    const v = params.get(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k);
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
      case 'sort': {
        const f = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw bad(k);
        out.sort = { field: f, desc: v.startsWith('-') };
        break;
      }
      case 'page':
      case 'pageSize': {
        if (!/^[0-9]+$/.test(v)) throw bad(k);
        const n = Number(v);
        if (n < 1 || (k === 'pageSize' && n > 100) || !Number.isSafeInteger(n)) throw bad(k);
        out[k] = n;
        break;
      }
      default:
        out[k] = v; // assignee, q, taskId
    }
  }
  return out;
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

const num = (id) => Number(String(id).replace(/\D/g, '')) || 0;

function filterAndSort(tasks, q, user) {
  let items = tasks;
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (q.status) items = items.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee == null : t.assignee === q.assignee));
  if (q.team) items = items.filter((t) => t.team === q.team);
  if (q.q) {
    const needle = fold(q.q);
    items = items.filter((t) => fold(t.title).includes(needle));
  }
  if (q.dueBefore) items = items.filter((t) => t.dueDate != null && t.dueDate <= q.dueBefore);
  const { field, desc } = q.sort || { field: 'createdAt', desc: false };
  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    if (field === 'dueDate') {
      const an = a.dueDate == null, bn = b.dueDate == null;
      if (an || bn) return an && bn ? 0 : an ? 1 : -1; // null luôn cuối
    }
    let c;
    if (field === 'title') c = String(a.title).localeCompare(String(b.title), 'vi');
    else c = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
    return c * dir;
  };
  return [...items].sort((a, b) => cmp(a, b) || num(a.id) - num(b.id));
}

module.exports = { parseQuery, filterAndSort, validDate };
