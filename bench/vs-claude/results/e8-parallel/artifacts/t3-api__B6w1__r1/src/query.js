'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const TEAMS = ['A', 'B'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const KNOWN = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function intIn(s, min, max) {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

function parseListQuery(searchParams, { paginate: allowPaging = true } = {}) {
  const out = { status: null, assignee: undefined, team: undefined, q: '', dueBefore: undefined, sort: { field: 'createdAt', dir: 'asc' }, page: 1, pageSize: 20 };
  const seen = new Set();
  for (const [key, value] of searchParams.entries()) {
    if (!KNOWN.includes(key) || seen.has(key)) throw bad(key);
    if ((key === 'page' || key === 'pageSize') && !allowPaging) throw bad(key);
    seen.add(key);
    switch (key) {
      case 'status': {
        const vals = value.split(',');
        if (!vals.every((v) => STATUSES.includes(v))) throw bad(key);
        out.status = vals;
        break;
      }
      case 'assignee': out.assignee = value; break;
      case 'team':
        if (!TEAMS.includes(value)) throw bad(key);
        out.team = value;
        break;
      case 'q': out.q = value; break;
      case 'dueBefore':
        if (!validDate(value)) throw bad(key);
        out.dueBefore = value;
        break;
      case 'sort': {
        const desc = value.startsWith('-');
        const field = desc ? value.slice(1) : value;
        if (!SORTS.includes(field)) throw bad(key);
        out.sort = { field, dir: desc ? 'desc' : 'asc' };
        break;
      }
      case 'page': {
        const n = intIn(value, 1, Infinity);
        if (n === null || !Number.isSafeInteger(n)) throw bad(key);
        out.page = n;
        break;
      }
      case 'pageSize': {
        const n = intIn(value, 1, 100);
        if (n === null) throw bad(key);
        out.pageSize = n;
        break;
      }
    }
  }
  return out;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function applyQuery(tasks, parsed, user) {
  const q = fold(parsed.q || '');
  let list = tasks.filter((t) => {
    if (user && user.role === 'member' && t.team !== user.team) return false;
    if (parsed.status && !parsed.status.includes(t.status)) return false;
    if (parsed.assignee !== undefined) {
      if (parsed.assignee === 'none' ? t.assignee != null : t.assignee !== parsed.assignee) return false;
    }
    if (parsed.team !== undefined && t.team !== parsed.team) return false;
    if (q && !fold(t.title ?? '').includes(q)) return false;
    if (parsed.dueBefore !== undefined && !(t.dueDate && t.dueDate <= parsed.dueBefore)) return false;
    return true;
  });
  const { field, dir } = parsed.sort;
  const sign = dir === 'desc' ? -1 : 1;
  const cmp = (a, b) => {
    if (field === 'dueDate') {
      const ea = !a.dueDate;
      const eb = !b.dueDate;
      if (ea || eb) return ea === eb ? idNum(a) - idNum(b) : ea ? 1 : -1;
    }
    let c;
    if (field === 'title') c = String(a.title).localeCompare(String(b.title), 'vi');
    else if (field === 'priority') c = a.priority - b.priority;
    else c = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
    return c !== 0 ? c * sign : idNum(a) - idNum(b);
  };
  list = list.sort(cmp);
  return { all: list, total: list.length };
}

function paginate(all, parsed) {
  const start = (parsed.page - 1) * parsed.pageSize;
  return all.slice(start, start + parsed.pageSize);
}

module.exports = { parseListQuery, applyQuery, paginate };
