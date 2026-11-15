'use strict';
const { HttpError } = require('../http');
const { STATUSES } = require('./constants');

const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const FILTER_KEYS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số truy vấn không hợp lệ: ${field}`, { field });
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function intIn(s, min, max) {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

function fold(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
}

/** Phân tích tham số truy vấn theo thứ tự xuất hiện; allowed = các khóa được phép. */
function parseQuery(searchParams, { paginate }) {
  const allowed = paginate ? [...FILTER_KEYS, 'page', 'pageSize'] : FILTER_KEYS;
  const seen = new Set();
  const out = { status: null, assignee: undefined, team: undefined, q: '', dueBefore: undefined, sort: 'createdAt', page: 1, pageSize: 20 };
  for (const [k, v] of searchParams.entries()) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k);
        out.status = parts;
        break;
      }
      case 'assignee':
        out.assignee = v;
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        out.team = v;
        break;
      case 'q':
        out.q = fold(v);
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        out.dueBefore = v;
        break;
      case 'sort':
        if (!SORTS.includes(v.replace(/^-/, ''))) throw bad(k);
        out.sort = v;
        break;
      case 'page': {
        const n = intIn(v, 1, Infinity);
        if (n === null) throw bad(k);
        out.page = n;
        break;
      }
      case 'pageSize': {
        const n = intIn(v, 1, 100);
        if (n === null) throw bad(k);
        out.pageSize = n;
        break;
      }
    }
  }
  return out;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, ''));

/** Lọc + sắp xếp (chưa phân trang) các nhiệm vụ user được phép thấy. */
function select(store, user, q) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (q.status) items = items.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee === null || t.assignee === undefined : t.assignee === q.assignee));
  if (q.team) items = items.filter((t) => t.team === q.team);
  if (q.q) items = items.filter((t) => fold(String(t.title)).includes(q.q));
  if (q.dueBefore) items = items.filter((t) => t.dueDate && t.dueDate <= q.dueBefore);
  const desc = q.sort.startsWith('-');
  const field = q.sort.replace(/^-/, '');
  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    const x = a[field];
    const y = b[field];
    if (field === 'dueDate') {
      const xn = x === null || x === undefined;
      const yn = y === null || y === undefined;
      if (xn && yn) return idNum(a) - idNum(b);
      if (xn) return 1;
      if (yn) return -1;
    }
    let c;
    if (field === 'title') c = String(x).localeCompare(String(y), 'vi');
    else c = x < y ? -1 : x > y ? 1 : 0;
    return c !== 0 ? c * dir : idNum(a) - idNum(b);
  };
  return items.sort(cmp);
}

module.exports = { parseQuery, select, bad };
