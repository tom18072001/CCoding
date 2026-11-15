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
  return s.replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Phân tích tham số lọc/sắp/phân trang theo thứ tự xuất hiện trên URL. */
function parseQuery(params, { paginate }) {
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', ...(paginate ? ['page', 'pageSize'] : [])];
  const seen = new Set();
  const o = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  for (const [k, v] of params.entries()) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k);
        o.status = parts;
        break;
      }
      case 'assignee':
        o.assignee = v;
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        o.team = v;
        break;
      case 'q':
        o.q = v ? fold(v) : undefined;
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        o.dueBefore = v;
        break;
      case 'sort': {
        const f = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw bad(k);
        o.sort = f;
        o.desc = v.startsWith('-');
        break;
      }
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1) throw bad(k);
        o.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k);
        o.pageSize = Number(v);
        break;
    }
  }
  return o;
}

const num = (id) => Number(String(id).replace(/\D/g, '')) || 0;

function applyQuery(tasks, o, user) {
  const items = tasks.filter((t) => {
    if (user.role === 'member' && t.team !== user.team) return false;
    if (o.status && !o.status.includes(t.status)) return false;
    if (o.assignee !== undefined) {
      if (o.assignee === 'none' ? t.assignee != null : t.assignee !== o.assignee) return false;
    }
    if (o.team && t.team !== o.team) return false;
    if (o.q && !fold(String(t.title)).includes(o.q)) return false;
    if (o.dueBefore && !(t.dueDate && t.dueDate <= o.dueBefore)) return false;
    return true;
  });
  const dir = o.desc ? -1 : 1;
  const cmp = (a, b) => {
    const x = a[o.sort];
    const y = b[o.sort];
    if (o.sort === 'dueDate') {
      const xn = x == null;
      const yn = y == null;
      if (xn || yn) return xn && yn ? 0 : xn ? 1 : -1; // null luôn cuối
    }
    const c = o.sort === 'title' ? String(x).localeCompare(String(y), 'vi') : x < y ? -1 : x > y ? 1 : 0;
    return c * dir;
  };
  return items.sort((a, b) => cmp(a, b) || num(a.id) - num(b.id));
}

module.exports = { parseQuery, applyQuery };
