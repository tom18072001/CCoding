'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title'];
const BASE_KEYS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

function bad(field, message) {
  return new HttpError(400, 'INVALID_QUERY', message, { field });
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCFullYear(y); // năm < 100
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parseTaskQuery(searchParams, { allowPaging = true } = {}) {
  const allowed = allowPaging ? [...BASE_KEYS, 'page', 'pageSize'] : BASE_KEYS;
  const out = {
    status: null, assignee: null, team: null, q: '', dueBefore: null,
    sort: { field: 'createdAt', desc: false }, page: 1, pageSize: 20,
  };
  const seen = new Set();
  for (const [key, value] of searchParams) {
    if (!allowed.includes(key)) throw bad(key, `Tham số không được hỗ trợ: ${key}`);
    if (seen.has(key)) throw bad(key, `Tham số lặp: ${key}`);
    seen.add(key);
    switch (key) {
      case 'status': {
        const parts = value.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(key, 'status không hợp lệ');
        out.status = parts;
        break;
      }
      case 'assignee':
        out.assignee = value;
        break;
      case 'team':
        if (value !== 'A' && value !== 'B') throw bad(key, 'team phải là A hoặc B');
        out.team = value;
        break;
      case 'q':
        out.q = value;
        break;
      case 'dueBefore':
        if (!validDate(value)) throw bad(key, 'dueBefore phải là ngày YYYY-MM-DD hợp lệ');
        out.dueBefore = value;
        break;
      case 'sort': {
        const desc = value.startsWith('-');
        const field = desc ? value.slice(1) : value;
        if (!SORT_FIELDS.includes(field)) throw bad(key, 'sort không hợp lệ');
        out.sort = { field, desc };
        break;
      }
      case 'page':
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw bad(key, 'page phải là số nguyên ≥ 1');
        out.page = Number(value);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100) throw bad(key, 'pageSize phải là số nguyên 1–100');
        out.pageSize = Number(value);
        break;
      default:
    }
  }
  return out;
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function idNum(t) {
  const m = /(\d+)/.exec(String(t.id));
  return m ? Number(m[1]) : 0;
}

function cmpValue(field, a, b) {
  if (field === 'title') return String(a.title).localeCompare(String(b.title), 'vi');
  if (field === 'priority') return a.priority - b.priority;
  const x = a[field], y = b[field];
  return x < y ? -1 : x > y ? 1 : 0;
}

function runQuery(tasks, parsed, { paginate = true } = {}) {
  const q = fold(parsed.q || '');
  const filtered = tasks.filter((t) => {
    if (parsed.status && !parsed.status.includes(t.status)) return false;
    if (parsed.assignee !== null) {
      if (parsed.assignee === 'none' ? t.assignee !== null : t.assignee !== parsed.assignee) return false;
    }
    if (parsed.team && t.team !== parsed.team) return false;
    if (q && !fold(t.title).includes(q)) return false;
    if (parsed.dueBefore) {
      if (!t.dueDate || String(t.dueDate).slice(0, 10) > parsed.dueBefore) return false;
    }
    return true;
  });
  const { field, desc } = parsed.sort;
  const dir = desc ? -1 : 1;
  filtered.sort((a, b) => {
    if (field === 'dueDate') {
      const an = a.dueDate == null, bn = b.dueDate == null;
      if (an !== bn) return an ? 1 : -1;
      if (!an) {
        const c = cmpValue(field, a, b);
        if (c) return c * dir;
      }
    } else {
      const c = cmpValue(field, a, b);
      if (c) return c * dir;
    }
    return idNum(a) - idNum(b);
  });
  const total = filtered.length;
  if (!paginate) return { items: filtered, total, page: 1, pageSize: total };
  const start = (parsed.page - 1) * parsed.pageSize;
  return { items: filtered.slice(start, start + parsed.pageSize), total, page: parsed.page, pageSize: parsed.pageSize };
}

module.exports = { parseTaskQuery, runQuery };
