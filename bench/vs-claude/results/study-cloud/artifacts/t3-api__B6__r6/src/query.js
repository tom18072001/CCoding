'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const TEAMS = ['A', 'B'];
const SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title'];
const BASE_KEYS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

function bad(field, message) {
  return new HttpError(400, 'INVALID_QUERY', message, { field });
}

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parseTaskQuery(searchParams, { allowPaging = true } = {}) {
  const out = {
    statuses: null, assignee: null, team: null, q: '', dueBefore: null,
    sort: { field: 'createdAt', desc: false }, page: 1, pageSize: 20,
  };
  const allowed = allowPaging ? [...BASE_KEYS, 'page', 'pageSize'] : BASE_KEYS;
  const seen = new Set();
  for (const [key, value] of searchParams.entries()) {
    if (!allowed.includes(key)) throw bad(key, `Tham số không được hỗ trợ: ${key}`);
    if (seen.has(key)) throw bad(key, `Tham số bị lặp: ${key}`);
    seen.add(key);
    switch (key) {
      case 'status': {
        const parts = value.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(key, 'status không hợp lệ');
        out.statuses = parts;
        break;
      }
      case 'assignee':
        out.assignee = value === '' ? null : value;
        break;
      case 'team':
        if (!TEAMS.includes(value)) throw bad(key, 'team phải là A hoặc B');
        out.team = value;
        break;
      case 'q':
        out.q = value;
        break;
      case 'dueBefore':
        if (!isRealDate(value)) throw bad(key, 'dueBefore phải là ngày YYYY-MM-DD hợp lệ');
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
        if (!/^\d+$/.test(value) || Number(value) < 1) throw bad(key, 'page phải là số nguyên >= 1');
        out.page = Number(value);
        break;
      case 'pageSize': {
        const n = Number(value);
        if (!/^\d+$/.test(value) || n < 1 || n > 100) throw bad(key, 'pageSize phải là số nguyên 1-100');
        out.pageSize = n;
        break;
      }
    }
  }
  return out;
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function idNum(id) {
  const m = /\d+/.exec(String(id));
  return m ? Number(m[0]) : 0;
}

function applyTaskQuery(tasks, parsed) {
  const needle = parsed.q ? fold(parsed.q) : '';
  let items = tasks.filter((t) => {
    if (parsed.statuses && !parsed.statuses.includes(t.status)) return false;
    if (parsed.assignee !== null) {
      const a = t.assignee === undefined ? null : t.assignee;
      if (parsed.assignee === 'none' ? a !== null : a !== parsed.assignee) return false;
    }
    if (parsed.team && t.team !== parsed.team) return false;
    if (needle && !fold(t.title || '').includes(needle)) return false;
    if (parsed.dueBefore && (!t.dueDate || t.dueDate > parsed.dueBefore)) return false;
    return true;
  });
  const { field, desc } = parsed.sort;
  const dir = desc ? -1 : 1;
  items = items.slice().sort((a, b) => {
    const va = a[field];
    const vb = b[field];
    if (field === 'dueDate') {
      const na = va == null;
      const nb = vb == null;
      if (na || nb) {
        if (na && nb) return idNum(a.id) - idNum(b.id);
        return na ? 1 : -1; // null luôn nằm cuối
      }
    }
    let c;
    if (field === 'title') c = String(va).localeCompare(String(vb), 'vi');
    else c = va < vb ? -1 : va > vb ? 1 : 0;
    if (c !== 0) return c * dir;
    return idNum(a.id) - idNum(b.id);
  });
  return { items, total: items.length };
}

function paginate(items, parsed) {
  return items.slice((parsed.page - 1) * parsed.pageSize, parsed.page * parsed.pageSize);
}

module.exports = { parseTaskQuery, applyTaskQuery, paginate };
