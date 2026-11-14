'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function fold(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
}

/** Phân tích tham số truy vấn theo thứ tự xuất hiện trên URL. */
function parseListQuery(params, { paginate }) {
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];
  if (paginate) allowed.push('page', 'pageSize');
  const q = { page: 1, pageSize: 20, sort: 'createdAt', desc: false };
  const seen = new Set();
  for (const [k, v] of params) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k);
        q.status = parts;
        break;
      }
      case 'assignee': q.assignee = v; break;
      case 'team':
        if (v !== 'A' && v !== 'B') throw bad(k);
        q.team = v;
        break;
      case 'q': q.q = v; break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        q.dueBefore = v;
        break;
      case 'sort': {
        const f = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw bad(k);
        q.sort = f;
        q.desc = v.startsWith('-');
        break;
      }
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

function selectTasks(all, q, user) {
  const needle = q.q ? fold(q.q) : '';
  let items = all.filter((t) => {
    if (user.role === 'member' && t.team !== user.team) return false;
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined && (q.assignee === 'none' ? t.assignee !== null && t.assignee !== undefined : t.assignee !== q.assignee)) return false;
    if (q.team && t.team !== q.team) return false;
    if (needle && !fold(t.title).includes(needle)) return false;
    if (q.dueBefore && !(t.dueDate && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const dir = q.desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    if (q.sort === 'dueDate') {
      const an = !a.dueDate, bn = !b.dueDate;
      if (an || bn) {
        if (an && bn) return idNum(a) - idNum(b);
        return an ? 1 : -1; // không có dueDate luôn cuối
      }
      c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (q.sort === 'priority') c = a.priority - b.priority;
    else if (q.sort === 'title') c = a.title.localeCompare(b.title, 'vi');
    else c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    return c * dir || idNum(a) - idNum(b);
  };
  items = items.sort(cmp);
  return { items, total: items.length };
}

module.exports = { parseListQuery, selectTasks };
