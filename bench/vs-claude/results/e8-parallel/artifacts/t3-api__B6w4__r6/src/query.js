'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const TEAMS = ['A', 'B'];
const SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title'];

function invalid(field, message) {
  return new HttpError(400, 'INVALID_QUERY', message || `Tham số không hợp lệ: ${field}`, { field });
}

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parseInt10(s, min, max) {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < min || n > max) return null;
  return n;
}

/** Bỏ dấu tiếng Việt, hạ chữ thường, đ → d. */
function fold(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd');
}

function parseTaskQuery(searchParams, { paging = true } = {}) {
  const allowed = new Set(['status', 'assignee', 'team', 'q', 'dueBefore', 'sort']);
  if (paging) { allowed.add('page'); allowed.add('pageSize'); }
  const out = {
    status: null, assignee: undefined, team: undefined, q: '', dueBefore: undefined,
    sort: { field: 'createdAt', desc: false }, page: 1, pageSize: 20,
  };
  const seen = new Set();
  for (const [name, value] of searchParams.entries()) {
    if (!allowed.has(name)) throw invalid(name, `Tham số lạ: ${name}`);
    if (seen.has(name)) throw invalid(name, `Tham số lặp: ${name}`);
    seen.add(name);
    switch (name) {
      case 'status': {
        const parts = value.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw invalid(name);
        out.status = [...new Set(parts)];
        break;
      }
      case 'assignee':
        if (value === '') throw invalid(name);
        out.assignee = value;
        break;
      case 'team':
        if (!TEAMS.includes(value)) throw invalid(name);
        out.team = value;
        break;
      case 'q':
        out.q = value;
        break;
      case 'dueBefore':
        if (!isRealDate(value)) throw invalid(name);
        out.dueBefore = value;
        break;
      case 'sort': {
        const desc = value.startsWith('-');
        const field = desc ? value.slice(1) : value;
        if (!SORT_FIELDS.includes(field)) throw invalid(name);
        out.sort = { field, desc };
        break;
      }
      case 'page': {
        const n = parseInt10(value, 1, Number.MAX_SAFE_INTEGER);
        if (n === null) throw invalid(name);
        out.page = n;
        break;
      }
      case 'pageSize': {
        const n = parseInt10(value, 1, 100);
        if (n === null) throw invalid(name);
        out.pageSize = n;
        break;
      }
    }
  }
  if (!paging) { delete out.page; delete out.pageSize; }
  return out;
}

function idNum(t) {
  const n = Number(String(t.id).replace(/\D/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function cmpValue(field, a, b) {
  if (field === 'title') return String(a).localeCompare(String(b), 'vi');
  return a < b ? -1 : a > b ? 1 : 0;
}

function applyQuery(tasks, parsed) {
  const q = fold(parsed.q);
  let list = tasks.filter((t) => {
    if (parsed.status && !parsed.status.includes(t.status)) return false;
    if (parsed.assignee !== undefined) {
      if (parsed.assignee === 'none') { if (t.assignee != null) return false; }
      else if (t.assignee !== parsed.assignee) return false;
    }
    if (parsed.team !== undefined && t.team !== parsed.team) return false;
    if (q && !fold(t.title).includes(q)) return false;
    if (parsed.dueBefore !== undefined && !(t.dueDate != null && t.dueDate <= parsed.dueBefore)) return false;
    return true;
  });

  const { field, desc } = parsed.sort || { field: 'createdAt', desc: false };
  list = list.slice().sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (field === 'dueDate') {
      const an = av == null;
      const bn = bv == null;
      if (an && bn) return idNum(a) - idNum(b);
      if (an) return 1;
      if (bn) return -1;
    }
    let c = cmpValue(field, av, bv);
    if (desc) c = -c;
    return c !== 0 ? c : idNum(a) - idNum(b);
  });

  const page = parsed.page ?? 1;
  const pageSize = parsed.pageSize ?? 20;
  const start = (page - 1) * pageSize;
  const items = parsed.page === undefined && parsed.pageSize === undefined ? list : list.slice(start, start + pageSize);
  return { matched: list, total: list.length, page, pageSize, items };
}

module.exports = { parseTaskQuery, applyQuery };
