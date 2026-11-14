'use strict';
const { HttpError } = require('../http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Kiểm tra tham số theo thứ tự xuất hiện trên URL; trả về giá trị đã parse. */
function parseQuery(params, allowed) {
  const counts = new Map();
  for (const [k] of params) counts.set(k, (counts.get(k) || 0) + 1);
  const out = {};
  for (const [k, n] of counts) {
    if (!allowed.includes(k) || n > 1) throw bad(k);
    const v = params.get(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k);
        out.status = parts;
        break;
      }
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        out.team = v;
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        out.dueBefore = v;
        break;
      case 'sort': {
        const f = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw bad(k);
        out.sort = { field: f, desc: v.startsWith('-') };
        break;
      }
      case 'page':
        if (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) < 1) throw bad(k);
        out.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k);
        out.pageSize = Number(v);
        break;
      default:
        out[k] = v; // assignee, q, taskId
    }
  }
  return out;
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function selectTasks(store, user, q) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (q.status) items = items.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee == null : t.assignee === q.assignee));
  if (q.team) items = items.filter((t) => t.team === q.team);
  if (q.q) {
    const needle = fold(q.q);
    items = items.filter((t) => fold(t.title).includes(needle));
  }
  if (q.dueBefore) items = items.filter((t) => t.dueDate != null && t.dueDate <= q.dueBefore);
  const { field, desc } = q.sort || { field: 'createdAt', desc: false };
  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    if (field === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) return an && bn ? idNum(a) - idNum(b) : an ? 1 : -1;
    }
    let r;
    if (field === 'title') r = a.title.localeCompare(b.title, 'vi');
    else r = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
    return r * dir || idNum(a) - idNum(b);
  };
  return items.sort(cmp);
}

module.exports = { parseQuery, selectTasks, fold };
