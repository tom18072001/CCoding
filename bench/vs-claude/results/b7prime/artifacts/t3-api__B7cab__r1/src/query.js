'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function intIn(s, min, max) {
  if (!/^\d+$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : undefined;
}

/** Duyệt tham số theo thứ tự trên URL; lỗi đầu tiên được báo. */
function parseQuery(searchParams, allowed, parsers) {
  const out = {};
  const seen = new Set();
  for (const [k, v] of searchParams) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    const r = parsers[k](v);
    if (r === undefined) throw bad(k);
    out[k] = r;
  }
  return out;
}

const taskParsers = {
  status(v) {
    const parts = v.split(',');
    return parts.every((p) => STATUSES.includes(p)) ? parts : undefined;
  },
  assignee: (v) => v,
  team: (v) => (v === 'A' || v === 'B' ? v : undefined),
  q: (v) => v,
  dueBefore: (v) => (validDate(v) ? v : undefined),
  sort(v) {
    const f = v.startsWith('-') ? v.slice(1) : v;
    return SORTS.includes(f) ? { field: f, desc: v.startsWith('-') } : undefined;
  },
  page: (v) => intIn(v, 1, Infinity),
  pageSize: (v) => intIn(v, 1, 100),
};

function parseTaskQuery(searchParams, { paged }) {
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];
  if (paged) allowed.push('page', 'pageSize');
  return parseQuery(searchParams, allowed, taskParsers);
}

function parseAuditQuery(searchParams) {
  return parseQuery(searchParams, ['taskId'], { taskId: (v) => v });
}

function normalize(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

/** Lọc + sắp xếp (chưa phân trang). `tasks` đã được giới hạn quyền đọc. */
function filterSort(tasks, q) {
  let items = tasks;
  if (q.status) items = items.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee == null : t.assignee === q.assignee));
  if (q.team) items = items.filter((t) => t.team === q.team);
  if (q.q) {
    const needle = normalize(q.q);
    items = items.filter((t) => normalize(String(t.title)).includes(needle));
  }
  if (q.dueBefore) items = items.filter((t) => t.dueDate != null && t.dueDate <= q.dueBefore);
  const { field, desc } = q.sort || { field: 'createdAt', desc: false };
  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    if (field === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) c = an && bn ? 0 : an ? 1 : -1; // null luôn cuối, không đảo chiều
      else c = dir * (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0);
    } else if (field === 'title') c = dir * String(a.title).localeCompare(String(b.title), 'vi');
    else c = dir * (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0);
    return c || idNum(a) - idNum(b);
  };
  return [...items].sort(cmp);
}

module.exports = { parseTaskQuery, parseAuditQuery, filterSort };
