'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const BASE_KEYS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

function bad(field, msg) {
  return new HttpError(400, 'INVALID_QUERY', msg, { field });
}

function normalize(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(2000, mo - 1, d));
  dt.setUTCFullYear(y);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parseListQuery(searchParams, { paginate = true } = {}) {
  const allowed = paginate ? [...BASE_KEYS, 'page', 'pageSize'] : BASE_KEYS;
  const seen = new Set();
  const out = { status: null, assignee: undefined, team: null, q: '', dueBefore: null, sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  for (const [key, value] of searchParams.entries()) {
    if (!allowed.includes(key)) throw bad(key, `Tham số không hợp lệ: ${key}`);
    if (seen.has(key)) throw bad(key, `Tham số lặp: ${key}`);
    seen.add(key);
    switch (key) {
      case 'status': {
        const list = value.split(',');
        if (!list.every((v) => STATUSES.includes(v))) throw bad(key, 'status không hợp lệ');
        out.status = list;
        break;
      }
      case 'assignee':
        if (value !== '') out.assignee = value;
        break;
      case 'team':
        if (value !== 'A' && value !== 'B') throw bad(key, 'team phải là A hoặc B');
        out.team = value;
        break;
      case 'q':
        out.q = normalize(value);
        break;
      case 'dueBefore':
        if (!validDate(value)) throw bad(key, 'dueBefore phải là YYYY-MM-DD hợp lệ');
        out.dueBefore = value;
        break;
      case 'sort': {
        const desc = value.startsWith('-');
        const f = desc ? value.slice(1) : value;
        if (!SORTS.includes(f)) throw bad(key, 'sort không hợp lệ');
        out.sort = f;
        out.desc = desc;
        break;
      }
      case 'page':
        if (!/^\d+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) throw bad(key, 'page phải là số nguyên ≥ 1');
        out.page = Number(value);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100) throw bad(key, 'pageSize phải là số nguyên 1–100');
        out.pageSize = Number(value);
        break;
    }
  }
  out.paginate = paginate;
  return out;
}

function idNum(t) {
  const n = parseInt(String(t.id).replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function cmpValue(f, a, b) {
  if (f === 'title') return String(a.title).localeCompare(String(b.title), 'vi');
  if (f === 'priority') return a.priority - b.priority;
  return a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : 0;
}

function applyListQuery(tasks, parsed, { team } = {}) {
  const list = tasks.filter((t) => {
    if (team && t.team !== team) return false;
    if (parsed.status && !parsed.status.includes(t.status)) return false;
    if (parsed.assignee !== undefined) {
      if (parsed.assignee === 'none' ? t.assignee != null : t.assignee !== parsed.assignee) return false;
    }
    if (parsed.team && t.team !== parsed.team) return false;
    if (parsed.q && !normalize(t.title).includes(parsed.q)) return false;
    if (parsed.dueBefore && (t.dueDate == null || t.dueDate > parsed.dueBefore)) return false;
    return true;
  });
  const f = parsed.sort || 'createdAt';
  const dir = parsed.desc ? -1 : 1;
  list.sort((a, b) => {
    if (f === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an !== bn) return an ? 1 : -1;
      if (an && bn) return idNum(a) - idNum(b);
    }
    return cmpValue(f, a, b) * dir || idNum(a) - idNum(b);
  });
  const total = list.length;
  if (parsed.paginate === false) return { items: list, total, page: 1, pageSize: total };
  const { page, pageSize } = parsed;
  return { items: list.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize };
}

module.exports = { parseListQuery, applyListQuery, normalize };
