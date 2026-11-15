'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCFullYear(y);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parseInt10(s, min, max) {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

/** Bỏ dấu tiếng Việt + hạ chữ thường. */
function fold(s) {
  return String(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

const VALIDATORS = {
  status: (v) => {
    const parts = v.split(',');
    return parts.every((p) => STATUSES.includes(p)) ? parts : null;
  },
  assignee: (v) => v,
  team: (v) => (v === 'A' || v === 'B' ? v : null),
  q: (v) => v,
  dueBefore: (v) => (isRealDate(v) ? v : null),
  sort: (v) => (SORTS.includes(v.startsWith('-') ? v.slice(1) : v) ? v : null),
  page: (v) => parseInt10(v, 1, Number.MAX_SAFE_INTEGER),
  pageSize: (v) => parseInt10(v, 1, 100),
};

/**
 * Phân tích query theo thứ tự xuất hiện trên URL; lỗi đầu tiên được báo.
 * allowed: danh sách tham số được phép.
 */
function parseQuery(searchParams, allowed) {
  const out = {};
  for (const [key, value] of searchParams.entries()) {
    if (!allowed.includes(key)) throw bad(key);
    if (Object.prototype.hasOwnProperty.call(out, key)) throw bad(key);
    const v = allowed === null ? value : VALIDATORS[key] ? VALIDATORS[key](value) : value;
    if (v === null) throw bad(key);
    out[key] = v;
  }
  return out;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function compareBy(field, desc) {
  return (a, b) => {
    let c;
    if (field === 'dueDate') {
      const an = a.dueDate == null, bn = b.dueDate == null;
      if (an || bn) return an && bn ? idNum(a) - idNum(b) : an ? 1 : -1; // rỗng luôn cuối
      c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (field === 'title') c = a.title.localeCompare(b.title, 'vi');
    else if (field === 'priority') c = a.priority - b.priority;
    else c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    if (desc) c = -c;
    return c || idNum(a) - idNum(b);
  };
}

/** Áp lọc + sắp xếp (không phân trang) cho người dùng `user`. */
function filterTasks(tasks, q, user) {
  let list = tasks;
  if (user.role === 'member') list = list.filter((t) => t.team === user.team);
  if (q.status) list = list.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) list = list.filter((t) => (q.assignee === 'none' ? t.assignee == null : t.assignee === q.assignee));
  if (q.team) list = list.filter((t) => t.team === q.team);
  if (q.q) {
    const needle = fold(q.q);
    list = list.filter((t) => fold(t.title).includes(needle));
  }
  if (q.dueBefore) list = list.filter((t) => t.dueDate != null && t.dueDate <= q.dueBefore);
  const sort = q.sort || 'createdAt';
  const desc = sort.startsWith('-');
  return [...list].sort(compareBy(desc ? sort.slice(1) : sort, desc));
}

module.exports = { parseQuery, filterTasks, isRealDate };
