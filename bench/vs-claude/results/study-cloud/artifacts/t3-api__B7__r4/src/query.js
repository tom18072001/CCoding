'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const BASE = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function normalize(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function intParam(v, min, max) {
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

/** Phân tích query của danh sách/CSV; lỗi đầu tiên theo thứ tự xuất hiện trên URL. */
function parseTaskQuery(params, { paged }) {
  const allowed = paged ? [...BASE, 'page', 'pageSize'] : BASE;
  const counts = new Map();
  for (const k of params.keys()) counts.set(k, (counts.get(k) || 0) + 1);
  const q = { status: null, assignee: null, team: null, q: '', dueBefore: null, sort: 'createdAt', page: 1, pageSize: 20 };
  for (const [k, n] of counts) {
    if (!allowed.includes(k) || n > 1) throw bad(k);
    const v = params.get(k);
    switch (k) {
      case 'status': {
        const list = v.split(',');
        if (!list.every((x) => STATUSES.includes(x))) throw bad(k);
        q.status = list;
        break;
      }
      case 'assignee': q.assignee = v; break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        q.team = v;
        break;
      case 'q': q.q = normalize(v); break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        q.dueBefore = v;
        break;
      case 'sort':
        if (!SORTS.includes(v.replace(/^-/, ''))) throw bad(k);
        q.sort = v;
        break;
      case 'page':
      case 'pageSize': {
        const n = k === 'page' ? intParam(v, 1, Number.MAX_SAFE_INTEGER) : intParam(v, 1, 100);
        if (n === null) throw bad(k);
        q[k] = n;
        break;
      }
    }
  }
  return q;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function filterSort(tasks, q) {
  const r = tasks.filter((t) => {
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== null && (q.assignee === 'none' ? t.assignee !== null : t.assignee !== q.assignee)) return false;
    if (q.team && t.team !== q.team) return false;
    if (q.q && !normalize(t.title).includes(q.q)) return false;
    if (q.dueBefore && !(t.dueDate && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const dir = q.sort.startsWith('-') ? -1 : 1;
  const field = q.sort.replace(/^-/, '');
  return r.sort((a, b) => {
    let c;
    if (field === 'dueDate') {
      if (!a.dueDate !== !b.dueDate) return a.dueDate ? -1 : 1;
      c = !a.dueDate ? 0 : a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (field === 'title') c = a.title.localeCompare(b.title, 'vi');
    else c = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
    return c * dir || idNum(a) - idNum(b);
  });
}

module.exports = { parseTaskQuery, filterSort, normalize };
