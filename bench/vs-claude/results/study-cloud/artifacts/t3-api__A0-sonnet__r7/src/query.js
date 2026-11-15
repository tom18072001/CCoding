'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d && mo >= 1;
}

function fold(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

/** Phân tích tham số truy vấn của danh sách / xuất CSV. */
function parseTaskQuery(query, { paginate }) {
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', ...(paginate ? ['page', 'pageSize'] : [])];
  const seen = new Set();
  const out = { page: 1, pageSize: 20, sort: 'createdAt', desc: false };
  for (const [k, v] of query) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const list = v.split(',');
        if (!list.every((x) => STATUSES.includes(x))) throw bad(k);
        out.status = list;
        break;
      }
      case 'assignee': out.assignee = v; break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        out.team = v;
        break;
      case 'q': out.q = fold(v); break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        out.dueBefore = v;
        break;
      case 'sort': {
        const name = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(name)) throw bad(k);
        out.sort = name;
        out.desc = v.startsWith('-');
        break;
      }
      case 'page':
      case 'pageSize': {
        if (!/^\d+$/.test(v)) throw bad(k);
        const n = Number(v);
        if (n < 1 || (k === 'pageSize' && n > 100) || !Number.isSafeInteger(n)) throw bad(k);
        out[k] = n;
        break;
      }
    }
  }
  return out;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function applyTaskQuery(tasks, p) {
  let items = tasks.filter((t) => {
    if (p.status && !p.status.includes(t.status)) return false;
    if (p.assignee !== undefined && (p.assignee === 'none' ? t.assignee !== null && t.assignee !== undefined : t.assignee !== p.assignee)) return false;
    if (p.team && t.team !== p.team) return false;
    if (p.q && !fold(t.title).includes(p.q)) return false;
    if (p.dueBefore && !(t.dueDate && t.dueDate <= p.dueBefore)) return false;
    return true;
  });
  const dir = p.desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    if (p.sort === 'dueDate') {
      const an = a.dueDate == null, bn = b.dueDate == null;
      if (an !== bn) return an ? 1 : -1;
      if (!an) c = (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) * dir;
    } else if (p.sort === 'title') c = a.title.localeCompare(b.title, 'vi') * dir;
    else c = (a[p.sort] < b[p.sort] ? -1 : a[p.sort] > b[p.sort] ? 1 : 0) * dir;
    return c || idNum(a) - idNum(b);
  };
  return items.sort(cmp);
}

module.exports = { parseTaskQuery, applyTaskQuery };
