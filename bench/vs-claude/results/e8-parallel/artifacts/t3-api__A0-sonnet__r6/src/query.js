'use strict';
const { HttpError } = require('./http');

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
  return y >= 1 && dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function fold(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd');
}

/** Phân tích tham số truy vấn theo thứ tự xuất hiện; `allowed` là danh sách tham số cho phép. */
function parseQuery(searchParams, allowed) {
  const counts = new Map();
  const order = [];
  const values = new Map();
  for (const [k, v] of searchParams) {
    if (!counts.has(k)) {
      order.push(k);
      values.set(k, v);
    }
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const out = {};
  for (const k of order) {
    const v = values.get(k);
    if (!allowed.includes(k) || counts.get(k) > 1) throw bad(k);
    switch (k) {
      case 'status': {
        const list = v.split(',');
        if (!list.every((s) => STATUSES.includes(s))) throw bad(k);
        out.status = list;
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
        if (!/^[0-9]+$/.test(v) || Number(v) < 1 || !Number.isSafeInteger(Number(v))) throw bad(k);
        out.page = Number(v);
        break;
      case 'pageSize':
        if (!/^[0-9]+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k);
        out.pageSize = Number(v);
        break;
      case 'q':
        out.q = v === '' ? '' : fold(v);
        break;
      default:
        out[k] = v; // assignee, taskId
    }
  }
  return out;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

/** Lọc + sắp xếp (chưa phân trang). `user` là người gọi (để áp quyền đọc). */
function selectTasks(tasks, f, user) {
  let items = tasks;
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (f.status) items = items.filter((t) => f.status.includes(t.status));
  if (f.assignee !== undefined) items = items.filter((t) => (f.assignee === 'none' ? t.assignee === null : t.assignee === f.assignee));
  if (f.team) items = items.filter((t) => t.team === f.team);
  if (f.q) items = items.filter((t) => fold(String(t.title)).includes(f.q));
  if (f.dueBefore) items = items.filter((t) => t.dueDate != null && t.dueDate <= f.dueBefore);
  const { field, desc } = f.sort || { field: 'createdAt', desc: false };
  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    let c;
    if (field === 'dueDate') {
      const an = a.dueDate == null, bn = b.dueDate == null;
      if (an || bn) c = an && bn ? 0 : an ? 1 : -1; // null luôn cuối, không đảo chiều
      else c = a.dueDate < b.dueDate ? -dir : a.dueDate > b.dueDate ? dir : 0;
    } else if (field === 'title') c = a.title.localeCompare(b.title, 'vi') * dir;
    else c = (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * dir;
    return c || idNum(a) - idNum(b);
  };
  return [...items].sort(cmp);
}

module.exports = { parseQuery, selectTasks };
