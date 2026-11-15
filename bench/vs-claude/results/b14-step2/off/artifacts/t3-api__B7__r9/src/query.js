'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const FILTER_KEYS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số truy vấn không hợp lệ: ${field}`, { field });

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

const idNum = (id) => Number(String(id).replace(/\D/g, '')) || 0;

/** Phân tích + kiểm tra tham số theo thứ tự xuất hiện trên URL. */
function parseTaskQuery(params, { paginate }) {
  const allowed = paginate ? [...FILTER_KEYS, 'page', 'pageSize'] : FILTER_KEYS;
  const seen = new Set();
  const q = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  for (const [k, v] of params) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k);
        q.status = parts;
        break;
      }
      case 'assignee':
        q.assignee = v;
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        q.team = v;
        break;
      case 'q':
        q.q = fold(v);
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        q.dueBefore = v;
        break;
      case 'sort': {
        const desc = v.startsWith('-');
        const f = desc ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw bad(k);
        q.sort = f;
        q.desc = desc;
        break;
      }
      case 'page':
      case 'pageSize': {
        if (!/^\d+$/.test(v)) throw bad(k);
        const n = Number(v);
        if (n < 1 || (k === 'pageSize' && n > 100)) throw bad(k);
        q[k] = n;
        break;
      }
    }
  }
  return q;
}

function applyTaskQuery(tasks, q) {
  const items = tasks.filter((t) => {
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined) {
      if (q.assignee === 'none' ? t.assignee != null : t.assignee !== q.assignee) return false;
    }
    if (q.team && t.team !== q.team) return false;
    if (q.q && !fold(t.title).includes(q.q)) return false;
    if (q.dueBefore && !(t.dueDate && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const dir = q.desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    if (q.sort === 'dueDate') {
      if (!a.dueDate !== !b.dueDate) return a.dueDate ? -1 : 1;
      if (a.dueDate) c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (q.sort === 'title') c = String(a.title).localeCompare(String(b.title), 'vi');
    else c = a[q.sort] < b[q.sort] ? -1 : a[q.sort] > b[q.sort] ? 1 : 0;
    return c * dir || idNum(a.id) - idNum(b.id);
  };
  return items.sort(cmp);
}

module.exports = { parseTaskQuery, applyTaskQuery };
