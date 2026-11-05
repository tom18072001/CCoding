'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title'];

function normalizeVi(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function bad(field, msg) {
  return new HttpError(400, 'INVALID_QUERY', msg, { field });
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
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];
  if (paginate) allowed.push('page', 'pageSize');
  const out = {
    statuses: null, assignee: null, team: null, q: '', dueBefore: null,
    sort: { field: 'createdAt', dir: 1 }, page: 1, pageSize: 20,
  };
  const seen = new Set();
  for (const key of searchParams.keys()) {
    if (!allowed.includes(key)) throw bad(key, `Tham số không hợp lệ: ${key}`);
    if (seen.has(key)) throw bad(key, `Tham số lặp: ${key}`);
    seen.add(key);
    const v = searchParams.get(key);
    switch (key) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(key, 'status không hợp lệ');
        out.statuses = parts;
        break;
      }
      case 'assignee':
        if (v === '') throw bad(key, 'assignee không hợp lệ');
        out.assignee = v;
        break;
      case 'team':
        if (v !== 'A' && v !== 'B') throw bad(key, 'team không hợp lệ');
        out.team = v;
        break;
      case 'q':
        out.q = v;
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(key, 'dueBefore phải là ngày YYYY-MM-DD hợp lệ');
        out.dueBefore = v;
        break;
      case 'sort': {
        const desc = v.startsWith('-');
        const field = desc ? v.slice(1) : v;
        if (!SORT_FIELDS.includes(field)) throw bad(key, 'sort không hợp lệ');
        out.sort = { field, dir: desc ? -1 : 1 };
        break;
      }
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1 || !Number.isSafeInteger(Number(v))) throw bad(key, 'page không hợp lệ');
        out.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(key, 'pageSize không hợp lệ');
        out.pageSize = Number(v);
        break;
    }
  }
  return out;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function cmpValues(field, a, b) {
  if (field === 'title') return String(a).localeCompare(String(b), 'vi');
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return a < b ? -1 : a > b ? 1 : 0;
}

function applyQuery(tasks, parsed, { paginate = true } = {}) {
  const q = normalizeVi(parsed.q || '');
  let list = tasks.filter((t) => {
    if (parsed.statuses && !parsed.statuses.includes(t.status)) return false;
    if (parsed.assignee !== null) {
      if (parsed.assignee === 'none') {
        if (t.assignee != null) return false;
      } else if (t.assignee !== parsed.assignee) return false;
    }
    if (parsed.team !== null && t.team !== parsed.team) return false;
    if (q && !normalizeVi(t.title).includes(q)) return false;
    if (parsed.dueBefore !== null && !(t.dueDate != null && t.dueDate <= parsed.dueBefore)) return false;
    return true;
  });
  const { field, dir } = parsed.sort;
  list = list.slice().sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    const an = av == null;
    const bn = bv == null;
    if (an !== bn) return an ? 1 : -1; // null luôn ở cuối
    if (!an) {
      const c = cmpValues(field, av, bv);
      if (c !== 0) return c * dir;
    }
    return idNum(a) - idNum(b);
  });
  const total = list.length;
  if (paginate) {
    const start = (parsed.page - 1) * parsed.pageSize;
    list = list.slice(start, start + parsed.pageSize);
  }
  return { items: list, total };
}

module.exports = { parseListQuery, applyQuery, normalizeVi };
