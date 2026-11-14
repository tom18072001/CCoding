'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số truy vấn không hợp lệ: ${field}`, { field });

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const CHECKS = {
  status: (v) => v.split(',').every((x) => STATUSES.includes(x)),
  assignee: () => true,
  team: (v) => v === 'A' || v === 'B',
  q: () => true,
  dueBefore: validDate,
  sort: (v) => SORTS.includes(v.replace(/^-/, '')),
  page: (v) => /^[1-9]\d*$/.test(v),
  pageSize: (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 100,
};

/** Kiểm tra searchParams theo whitelist; lỗi → báo tham số đầu tiên theo thứ tự xuất hiện. */
function parseQuery(searchParams, allowed) {
  const entries = [...searchParams.entries()];
  const count = {};
  for (const [k] of entries) count[k] = (count[k] || 0) + 1;
  const out = {};
  const seen = new Set();
  for (const [k, v] of entries) {
    if (seen.has(k)) continue;
    seen.add(k);
    if (!allowed.includes(k) || count[k] > 1) throw bad(k);
    if (CHECKS[k] && !CHECKS[k](v)) throw bad(k);
    out[k] = v;
  }
  return out;
}

const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

/** Lọc + sắp xếp (chưa phân trang). `user` để áp quyền member. */
function filterSort(tasks, q, user) {
  let items = tasks;
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (q.status !== undefined) {
    const set = q.status.split(',');
    items = items.filter((t) => set.includes(t.status));
  }
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee == null : t.assignee === q.assignee));
  if (q.team !== undefined) items = items.filter((t) => t.team === q.team);
  if (q.q) {
    const needle = fold(q.q);
    items = items.filter((t) => fold(t.title).includes(needle));
  }
  if (q.dueBefore !== undefined) items = items.filter((t) => t.dueDate != null && t.dueDate <= q.dueBefore);

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
    } else if (field === 'title') r = a.title.localeCompare(b.title, 'vi');
    else if (field === 'priority') r = a.priority - b.priority;
    else r = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    return r * dir || idNum(a) - idNum(b);
  };
  return [...items].sort(cmp);
}

module.exports = { parseQuery, filterSort, LIST_PARAMS };
