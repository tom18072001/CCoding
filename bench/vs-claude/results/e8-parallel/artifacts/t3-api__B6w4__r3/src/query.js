'use strict';
const { HttpError } = require('./' + 'http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const KNOWN = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];

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

function fold(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
}

/** Parse URLSearchParams theo thứ tự xuất hiện; lỗi đầu tiên được báo. `allowPaging=false` cho export. */
function parseQuery(searchParams, { allowPaging = true } = {}) {
  const out = { status: null, assignee: undefined, team: undefined, q: '', dueBefore: undefined, sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  const seen = new Set();
  for (const [key, value] of searchParams.entries()) {
    if (!KNOWN.includes(key) || (!allowPaging && (key === 'page' || key === 'pageSize'))) throw bad(key);
    if (seen.has(key)) throw bad(key);
    seen.add(key);
    switch (key) {
      case 'status': {
        const vals = value.split(',');
        if (!vals.every((v) => STATUSES.includes(v))) throw bad(key);
        out.status = vals;
        break;
      }
      case 'assignee':
        if (value === '') throw bad(key);
        out.assignee = value;
        break;
      case 'team':
        if (!['A', 'B'].includes(value)) throw bad(key);
        out.team = value;
        break;
      case 'q':
        out.q = fold(value);
        break;
      case 'dueBefore':
        if (!validDate(value)) throw bad(key);
        out.dueBefore = value;
        break;
      case 'sort': {
        const desc = value.startsWith('-');
        const f = desc ? value.slice(1) : value;
        if (!SORTS.includes(f)) throw bad(key);
        out.sort = f;
        out.desc = desc;
        break;
      }
      case 'page':
      case 'pageSize': {
        if (!/^\d+$/.test(value)) throw bad(key);
        const n = Number(value);
        if (n < 1 || (key === 'pageSize' && n > 100) || !Number.isSafeInteger(n)) throw bad(key);
        out[key] = n;
        break;
      }
    }
  }
  return out;
}

function idNum(t) {
  return Number(String(t.id).replace(/\D/g, '')) || 0;
}

function cmpValue(field, a, b) {
  if (field === 'title') return a.localeCompare(b, 'vi');
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Lọc + sắp xếp (không phân trang). `user` dùng để ép lọc nhóm với member. */
function filterSort(tasks, p, user) {
  let items = tasks.filter((t) => {
    if (user && user.role === 'member' && t.team !== user.team) return false;
    if (p.status && !p.status.includes(t.status)) return false;
    if (p.assignee !== undefined && (p.assignee === 'none' ? t.assignee != null : t.assignee !== p.assignee)) return false;
    if (p.team && t.team !== p.team) return false;
    if (p.q && !fold(t.title).includes(p.q)) return false;
    if (p.dueBefore && !(t.dueDate != null && t.dueDate <= p.dueBefore)) return false;
    return true;
  });
  const f = p.sort;
  items = items.slice().sort((a, b) => {
    let c = 0;
    if (f === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an !== bn) return an ? 1 : -1;
      if (an && bn) return idNum(a) - idNum(b);
    }
    c = cmpValue(f, a[f], b[f]);
    if (p.desc) c = -c;
    return c || idNum(a) - idNum(b);
  });
  return items;
}

function paginate(items, p) {
  const start = (p.page - 1) * p.pageSize;
  return { items: items.slice(start, start + p.pageSize), total: items.length, page: p.page, pageSize: p.pageSize };
}

module.exports = { parseQuery, filterSort, paginate, fold, validDate };
