'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title'];
const BASE_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];
const PAGE_PARAMS = ['page', 'pageSize'];

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
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function intInRange(s, min, max) {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

function parseListQuery(searchParams, { paging = true } = {}) {
  const allowed = paging ? [...BASE_PARAMS, ...PAGE_PARAMS] : BASE_PARAMS;
  const seen = new Set();
  const parsed = { status: null, assignee: null, team: null, q: '', dueBefore: null, sort: 'createdAt', desc: false, page: 1, pageSize: 20, paging };
  for (const [key, value] of searchParams) {
    if (!allowed.includes(key)) throw bad(key, `Tham số không hợp lệ: ${key}`);
    if (seen.has(key)) throw bad(key, `Tham số lặp: ${key}`);
    seen.add(key);
    switch (key) {
      case 'status': {
        const list = value.split(',');
        if (!list.every((v) => STATUSES.includes(v))) throw bad(key, 'status không hợp lệ');
        parsed.status = list;
        break;
      }
      case 'assignee':
        if (value === '') throw bad(key, 'assignee không hợp lệ');
        parsed.assignee = value;
        break;
      case 'team':
        if (value !== 'A' && value !== 'B') throw bad(key, 'team phải là A hoặc B');
        parsed.team = value;
        break;
      case 'q':
        parsed.q = normalize(value);
        break;
      case 'dueBefore':
        if (!validDate(value)) throw bad(key, 'dueBefore phải là YYYY-MM-DD hợp lệ');
        parsed.dueBefore = value;
        break;
      case 'sort': {
        const desc = value.startsWith('-');
        const field = desc ? value.slice(1) : value;
        if (!SORT_FIELDS.includes(field)) throw bad(key, 'sort không hợp lệ');
        parsed.sort = field;
        parsed.desc = desc;
        break;
      }
      case 'page': {
        const n = intInRange(value, 1, Number.MAX_SAFE_INTEGER);
        if (n === null) throw bad(key, 'page phải là số nguyên ≥ 1');
        parsed.page = n;
        break;
      }
      case 'pageSize': {
        const n = intInRange(value, 1, 100);
        if (n === null) throw bad(key, 'pageSize phải là số nguyên 1–100');
        parsed.pageSize = n;
        break;
      }
    }
  }
  return parsed;
}

function idNum(t) {
  return Number(String(t.id).replace(/\D/g, '')) || 0;
}

function applyQuery(tasks, parsed) {
  const out = tasks.filter((t) => {
    if (parsed.status && !parsed.status.includes(t.status)) return false;
    if (parsed.assignee !== null) {
      if (parsed.assignee === 'none') {
        if (t.assignee != null) return false;
      } else if (t.assignee !== parsed.assignee) return false;
    }
    if (parsed.team && t.team !== parsed.team) return false;
    if (parsed.q && !normalize(t.title ?? '').includes(parsed.q)) return false;
    if (parsed.dueBefore !== null && !(t.dueDate != null && t.dueDate <= parsed.dueBefore)) return false;
    return true;
  });
  const dir = parsed.desc ? -1 : 1;
  const field = parsed.sort;
  const cmp = (a, b) => {
    let c = 0;
    if (field === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) {
        if (an && bn) return idNum(a) - idNum(b);
        return an ? 1 : -1; // null luôn cuối
      }
      c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (field === 'title') {
      c = String(a.title).localeCompare(String(b.title), 'vi');
    } else if (field === 'priority') {
      c = a.priority < b.priority ? -1 : a.priority > b.priority ? 1 : 0;
    } else {
      c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    }
    return c * dir || idNum(a) - idNum(b);
  };
  return out.sort(cmp);
}

function paginate(arr, parsed) {
  const page = parsed.page ?? 1;
  const pageSize = parsed.pageSize ?? 20;
  const start = (page - 1) * pageSize;
  return { items: arr.slice(start, start + pageSize), total: arr.length, page, pageSize };
}

module.exports = { parseListQuery, applyQuery, paginate };
