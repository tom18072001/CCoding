'use strict';
const { HttpError } = require('./http');

const KNOWN = new Set(['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize']);
const STATUSES = ['todo', 'doing', 'done'];
const SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title'];

// Lỗi: HttpError(400, 'INVALID_QUERY', message, { field }) -> { error: { code, message, field } }
function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', 'Tham số truy vấn không hợp lệ', { field });
}

function fold(s) {
  return String(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(2000, mo - 1, d));
  dt.setUTCFullYear(y);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parseIntRange(v, min, max) {
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

function parseQuery(searchParams, { allowPaging = true } = {}) {
  const out = {
    filter: { status: null, assignee: null, team: null, q: '', dueBefore: null },
    sort: { field: 'createdAt', dir: 1 },
    page: 1,
    pageSize: 20,
  };
  const seen = new Set();
  for (const [key, value] of searchParams.entries()) {
    if (!KNOWN.has(key) || seen.has(key)) throw bad(key);
    if ((key === 'page' || key === 'pageSize') && !allowPaging) throw bad(key);
    seen.add(key);
    switch (key) {
      case 'status': {
        const parts = value.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(key);
        out.filter.status = [...new Set(parts)];
        break;
      }
      case 'assignee':
        out.filter.assignee = value; // 'none' = chưa giao
        break;
      case 'team':
        if (value !== 'A' && value !== 'B') throw bad(key);
        out.filter.team = value;
        break;
      case 'q':
        out.filter.q = fold(value);
        break;
      case 'dueBefore':
        if (!validDate(value)) throw bad(key);
        out.filter.dueBefore = value;
        break;
      case 'sort': {
        const desc = value.startsWith('-');
        const field = desc ? value.slice(1) : value;
        if (!SORT_FIELDS.includes(field)) throw bad(key);
        out.sort = { field, dir: desc ? -1 : 1 };
        break;
      }
      case 'page': {
        const n = parseIntRange(value, 1, Number.MAX_SAFE_INTEGER);
        if (n === null) throw bad(key);
        out.page = n;
        break;
      }
      case 'pageSize': {
        const n = parseIntRange(value, 1, 100);
        if (n === null) throw bad(key);
        out.pageSize = n;
        break;
      }
    }
  }
  return out;
}

function idNum(t) {
  const n = parseInt(String(t.id).replace(/\D+/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function cmpVal(field, a, b) {
  if (field === 'title') return String(a).localeCompare(String(b), 'vi');
  if (field === 'priority') return a - b;
  return a < b ? -1 : a > b ? 1 : 0;
}

function applyQuery(tasks, parsed, { forceTeam } = {}) {
  const { filter, sort } = parsed;
  let items = tasks.filter((t) => {
    if (forceTeam !== undefined && forceTeam !== null && t.team !== forceTeam) return false;
    if (filter.status && !filter.status.includes(t.status)) return false;
    if (filter.assignee !== null) {
      if (filter.assignee === 'none' ? t.assignee != null : t.assignee !== filter.assignee) return false;
    }
    if (filter.team !== null && t.team !== filter.team) return false;
    if (filter.q && !fold(t.title || '').includes(filter.q)) return false;
    if (filter.dueBefore !== null && !(t.dueDate && t.dueDate.slice(0, 10) <= filter.dueBefore)) return false;
    return true;
  });
  const { field, dir } = sort;
  items = items.slice().sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (field === 'dueDate') {
      const an = av == null;
      const bn = bv == null;
      if (an !== bn) return an ? 1 : -1; // null luôn cuối
      if (!an) {
        const c = cmpVal(field, av, bv);
        if (c !== 0) return c * dir;
      }
    } else {
      const c = cmpVal(field, av, bv);
      if (c !== 0) return c * dir;
    }
    return idNum(a) - idNum(b);
  });
  return { items, total: items.length };
}

function paginate(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

module.exports = { parseQuery, applyQuery, paginate };
