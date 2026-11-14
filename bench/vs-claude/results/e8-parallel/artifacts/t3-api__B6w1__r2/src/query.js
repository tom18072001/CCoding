'use strict';

const { HttpError } = require('./http');

const ALLOWED = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= days;
}

function parseTaskQuery(searchParams, { allowPaging = true } = {}) {
  const out = { filters: {}, sort: { field: 'createdAt', desc: false }, page: 1, pageSize: 20 };
  const seen = new Set();
  for (const [k, v] of searchParams.entries()) {
    const allowed = ALLOWED.includes(k) && (allowPaging || (k !== 'page' && k !== 'pageSize'));
    if (!allowed || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k);
        out.filters.status = parts;
        break;
      }
      case 'assignee':
        out.filters.assignee = v;
        break;
      case 'team':
        if (v !== 'A' && v !== 'B') throw bad(k);
        out.filters.team = v;
        break;
      case 'q':
        if (v !== '') out.filters.q = v;
        break;
      case 'dueBefore':
        if (!isRealDate(v)) throw bad(k);
        out.filters.dueBefore = v;
        break;
      case 'sort': {
        const desc = v.startsWith('-');
        const field = desc ? v.slice(1) : v;
        if (!SORTS.includes(field)) throw bad(k);
        out.sort = { field, desc };
        break;
      }
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1 || !Number.isSafeInteger(Number(v))) throw bad(k);
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

function normalize(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

function idNum(t) {
  const n = parseInt(String(t.id).replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function applyQuery(tasks, parsed, { teamLock } = {}) {
  const f = parsed.filters || {};
  const q = f.q ? normalize(f.q) : null;
  let items = tasks.filter((t) => {
    if (teamLock && t.team !== teamLock) return false;
    if (f.status && !f.status.includes(t.status)) return false;
    if (f.assignee !== undefined) {
      if (f.assignee === 'none' ? t.assignee != null : t.assignee !== f.assignee) return false;
    }
    if (f.team && t.team !== f.team) return false;
    if (q && !normalize(t.title || '').includes(q)) return false;
    if (f.dueBefore && !(t.dueDate != null && t.dueDate <= f.dueBefore)) return false;
    return true;
  });
  const { field, desc } = parsed.sort || { field: 'createdAt', desc: false };
  const dir = desc ? -1 : 1;
  items = items.slice().sort((a, b) => {
    let c = 0;
    if (field === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) {
        if (an && bn) return idNum(a) - idNum(b);
        return an ? 1 : -1;
      }
      c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (field === 'title') {
      c = String(a.title).localeCompare(String(b.title), 'vi');
    } else if (field === 'priority') {
      c = a.priority - b.priority;
    } else {
      c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    }
    if (c !== 0) return c * dir;
    return idNum(a) - idNum(b);
  });
  return { items, total: items.length };
}

function paginate(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

module.exports = { parseTaskQuery, applyQuery, paginate };
