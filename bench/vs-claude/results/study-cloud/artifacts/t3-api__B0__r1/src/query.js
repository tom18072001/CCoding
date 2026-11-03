'use strict';
const { HttpError } = require('./http');

const STATUS = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function fold(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Phân tích query của /tasks: lỗi đầu tiên theo thứ tự xuất hiện → 400 INVALID_QUERY. */
function parseTaskQuery(searchParams, { allowPaging = true } = {}) {
  const q = { status: null, assignee: undefined, team: null, q: '', dueBefore: null, sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  const known = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', ...(allowPaging ? ['page', 'pageSize'] : [])];
  const seen = new Set();
  for (const [k, v] of searchParams) {
    if (!known.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const list = v.split(',');
        if (!list.every((s) => STATUS.includes(s))) throw bad(k);
        q.status = list;
        break;
      }
      case 'assignee':
        q.assignee = v === 'none' ? null : v;
        break;
      case 'team':
        if (v !== 'A' && v !== 'B') throw bad(k);
        q.team = v;
        break;
      case 'q':
        q.q = fold(v);
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        q.dueBefore = v;
        break;
      case 'sort': {
        const name = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(name)) throw bad(k);
        q.sort = name;
        q.desc = v.startsWith('-');
        break;
      }
      case 'page':
        if (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) < 1) throw bad(k);
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

const num = (id) => Number(String(id).replace(/\D/g, ''));

/** Lọc + sắp xếp (chưa phân trang). `scope` = nhóm ép buộc của member hoặc null. */
function applyQuery(tasks, q, scope) {
  const r = tasks.filter((t) => {
    if (scope && t.team !== scope) return false;
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined && t.assignee !== q.assignee) return false;
    if (q.team && t.team !== q.team) return false;
    if (q.q && !fold(t.title).includes(q.q)) return false;
    if (q.dueBefore && (t.dueDate == null || t.dueDate > q.dueBefore)) return false;
    return true;
  });
  const dir = q.desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    if (q.sort === 'dueDate') {
      if (a.dueDate == null && b.dueDate == null) c = 0;
      else if (a.dueDate == null) return 1;
      else if (b.dueDate == null) return -1;
      else c = a.dueDate < b.dueDate ? -dir : a.dueDate > b.dueDate ? dir : 0;
    } else if (q.sort === 'title') c = a.title.localeCompare(b.title, 'vi') * dir;
    else if (q.sort === 'priority') c = (a.priority - b.priority) * dir;
    else c = a.createdAt < b.createdAt ? -dir : a.createdAt > b.createdAt ? dir : 0;
    return c || num(a.id) - num(b.id);
  };
  return r.sort(cmp);
}

module.exports = { parseTaskQuery, applyQuery };
