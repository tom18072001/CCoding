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
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

/** Phân tích query theo thứ tự xuất hiện; allowed = danh sách tham số cho phép. */
function parseTaskQuery(searchParams, { paginate }) {
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];
  if (paginate) allowed.push('page', 'pageSize');
  const out = { sort: 'createdAt', page: 1, pageSize: 20 };
  const seen = new Set();
  for (const [k, v] of searchParams.entries()) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k);
        out.status = parts;
        break;
      }
      case 'assignee':
        out.assignee = v;
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        out.team = v;
        break;
      case 'q':
        out.q = fold(v);
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        out.dueBefore = v;
        break;
      case 'sort': {
        const f = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw bad(k);
        out.sort = v;
        break;
      }
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1) throw bad(k);
        out.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k);
        out.pageSize = Number(v);
        break;
    }
  }
  return out;
}

const num = (id) => Number(String(id).replace(/\D/g, '')) || 0;

function applyQuery(tasks, q, user) {
  let items = tasks;
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (q.status) items = items.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee == null : t.assignee === q.assignee));
  if (q.team) items = items.filter((t) => t.team === q.team);
  if (q.q) items = items.filter((t) => fold(t.title).includes(q.q));
  if (q.dueBefore) items = items.filter((t) => t.dueDate != null && t.dueDate <= q.dueBefore);

  const desc = q.sort.startsWith('-');
  const f = desc ? q.sort.slice(1) : q.sort;
  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    if (f === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) return an && bn ? num(a.id) - num(b.id) : an ? 1 : -1;
    }
    let c;
    if (f === 'title') c = a.title.localeCompare(b.title, 'vi');
    else c = a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : 0;
    return c !== 0 ? c * dir : num(a.id) - num(b.id);
  };
  return [...items].sort(cmp);
}

module.exports = { parseTaskQuery, applyQuery };
