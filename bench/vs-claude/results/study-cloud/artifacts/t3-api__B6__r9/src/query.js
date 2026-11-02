'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const TEAMS = ['A', 'B'];
const SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title'];
const BASE_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

function bad(field, message) {
  return new HttpError(400, 'INVALID_QUERY', message || `Tham số ${field} không hợp lệ`, { field });
}

/** Chuẩn hóa để so khớp không dấu, không phân biệt hoa thường. */
function fold(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCFullYear(y); // năm < 100 không bị ánh xạ sang 19xx
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parseInteger(field, raw, min, max) {
  if (!/^\d+$/.test(raw)) throw bad(field);
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw bad(field);
  return n;
}

function parseListQuery(searchParams, { paging = true } = {}) {
  const allowed = paging ? [...BASE_PARAMS, 'page', 'pageSize'] : BASE_PARAMS;
  const out = { filters: {}, sort: { field: 'createdAt', desc: false }, page: 1, pageSize: 20, paging };
  const seen = new Set();
  for (const [key, raw] of searchParams) {
    if (!allowed.includes(key)) throw bad(key);
    if (seen.has(key)) throw bad(key);
    seen.add(key);
    switch (key) {
      case 'status': {
        const list = raw.split(',');
        if (!list.every((v) => STATUSES.includes(v))) throw bad(key);
        out.filters.status = [...new Set(list)];
        break;
      }
      case 'assignee':
        if (raw === '') throw bad(key);
        out.filters.assignee = raw;
        break;
      case 'team':
        if (!TEAMS.includes(raw)) throw bad(key);
        out.filters.team = raw;
        break;
      case 'q':
        if (raw !== '') out.filters.q = raw;
        break;
      case 'dueBefore':
        if (!isRealDate(raw)) throw bad(key);
        out.filters.dueBefore = raw;
        break;
      case 'sort': {
        const desc = raw.startsWith('-');
        const field = desc ? raw.slice(1) : raw;
        if (!SORT_FIELDS.includes(field)) throw bad(key);
        out.sort = { field, desc };
        break;
      }
      case 'page':
        out.page = parseInteger(key, raw, 1, Number.MAX_SAFE_INTEGER);
        break;
      case 'pageSize':
        out.pageSize = parseInteger(key, raw, 1, 100);
        break;
    }
  }
  return out;
}

function idNum(t) {
  return Number(String(t.id).replace(/\D/g, '')) || 0;
}

function cmpValues(field, a, b) {
  if (field === 'title') return String(a ?? '').localeCompare(String(b ?? ''), 'vi');
  return a < b ? -1 : a > b ? 1 : 0;
}

function applyQuery(tasks, parsed) {
  const { filters = {}, sort = { field: 'createdAt', desc: false } } = parsed;
  const page = parsed.page ?? 1;
  const pageSize = parsed.pageSize ?? 20;
  const q = filters.q ? fold(filters.q) : null;

  let rows = tasks.filter((t) => {
    if (filters.status && !filters.status.includes(t.status)) return false;
    if (filters.assignee !== undefined) {
      if (filters.assignee === 'none' ? t.assignee != null : t.assignee !== filters.assignee) return false;
    }
    if (filters.team && t.team !== filters.team) return false;
    if (q && !fold(t.title).includes(q)) return false;
    if (filters.dueBefore && !(t.dueDate != null && t.dueDate <= filters.dueBefore)) return false;
    return true;
  });

  const { field, desc } = sort;
  rows = rows.slice().sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    const aNull = av == null;
    const bNull = bv == null;
    if (field === 'dueDate' && (aNull || bNull)) {
      if (aNull && bNull) return idNum(a) - idNum(b);
      return aNull ? 1 : -1; // null luôn cuối
    }
    const c = cmpValues(field, av, bv);
    if (c !== 0) return desc ? -c : c;
    return idNum(a) - idNum(b);
  });

  const total = rows.length;
  if (parsed.paging !== false) rows = rows.slice((page - 1) * pageSize, page * pageSize);
  return { rows, total };
}

module.exports = { parseListQuery, applyQuery };
