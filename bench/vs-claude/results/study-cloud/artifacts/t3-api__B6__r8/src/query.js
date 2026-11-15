'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field, msg) {
  return new HttpError(400, 'INVALID_QUERY', msg, { field });
}

/** Chuẩn hóa để so khớp: NFD, bỏ dấu kết hợp, đ→d, lowercase. */
function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parseInt10(v, min, max) {
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

function parseTaskQuery(searchParams, { paging = true } = {}) {
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];
  if (paging) allowed.push('page', 'pageSize');
  const seen = new Set();
  const filters = {};
  const sort = { field: 'createdAt', desc: false };
  let page = 1;
  let pageSize = 20;
  for (const [key, value] of searchParams) {
    if (!allowed.includes(key)) throw bad(key, `Tham số không hợp lệ: ${key}`);
    if (seen.has(key)) throw bad(key, `Tham số lặp: ${key}`);
    seen.add(key);
    switch (key) {
      case 'status': {
        const list = value.split(',');
        if (!list.every((s) => STATUSES.includes(s))) throw bad(key, 'status phải thuộc todo, doing, done');
        filters.statuses = list;
        break;
      }
      case 'assignee':
        if (value === '') throw bad(key, 'assignee không được rỗng');
        filters.assignee = value === 'none' ? null : value;
        break;
      case 'team':
        if (value !== 'A' && value !== 'B') throw bad(key, 'team phải là A hoặc B');
        filters.team = value;
        break;
      case 'q':
        if (value !== '') filters.q = fold(value);
        break;
      case 'dueBefore':
        if (!validDate(value)) throw bad(key, 'dueBefore phải là ngày YYYY-MM-DD hợp lệ');
        filters.dueBefore = value;
        break;
      case 'sort': {
        const desc = value.startsWith('-');
        const field = desc ? value.slice(1) : value;
        if (!SORT_FIELDS.includes(field)) throw bad(key, 'sort không hợp lệ');
        sort.field = field;
        sort.desc = desc;
        break;
      }
      case 'page': {
        const n = parseInt10(value, 1, Number.MAX_SAFE_INTEGER);
        if (n === null) throw bad(key, 'page phải là số nguyên ≥ 1');
        page = n;
        break;
      }
      case 'pageSize': {
        const n = parseInt10(value, 1, 100);
        if (n === null) throw bad(key, 'pageSize phải là số nguyên 1–100');
        pageSize = n;
        break;
      }
    }
  }
  return { filters, sort, page, pageSize };
}

const idNum = (t) => {
  const n = parseInt(String(t.id).replace(/\D+/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
};

function applyQuery(tasks, parsed) {
  const { filters = {}, sort = { field: 'createdAt', desc: false }, page = 1, pageSize = 20 } = parsed;
  let list = tasks.filter((t) => {
    if (filters.statuses && !filters.statuses.includes(t.status)) return false;
    if (filters.assignee !== undefined && (t.assignee ?? null) !== filters.assignee) return false;
    if (filters.team !== undefined && t.team !== filters.team) return false;
    if (filters.q && !fold(t.title).includes(filters.q)) return false;
    if (filters.dueBefore !== undefined && (t.dueDate == null || t.dueDate > filters.dueBefore)) return false;
    return true;
  });
  const dir = sort.desc ? -1 : 1;
  const { field } = sort;
  list = list.slice().sort((a, b) => {
    let c = 0;
    if (field === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an !== bn) return an ? 1 : -1; // null luôn cuối
      if (!an) c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (field === 'title') {
      c = a.title.localeCompare(b.title, 'vi');
    } else {
      c = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
    }
    if (c !== 0) return c * dir;
    return idNum(a) - idNum(b);
  });
  const total = list.length;
  const start = (page - 1) * pageSize;
  return { matched: list, total, items: list.slice(start, start + pageSize) };
}

module.exports = { parseTaskQuery, applyQuery, fold };
