'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function isRealDate(s) {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function normalize(s) {
  return String(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

/** Phân tích query: allowed = tên tham số hợp lệ. Báo lỗi tham số đầu tiên (theo vị trí xuất hiện đầu trên URL). */
function parseQuery(searchParams, allowed) {
  const groups = new Map();
  for (const [k, v] of searchParams) {
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(v);
  }
  const out = {};
  for (const [k, vals] of groups) {
    if (!allowed.includes(k) || vals.length > 1) throw bad(k);
    const v = vals[0];
    switch (k) {
      case 'status': {
        const list = v.split(',');
        if (!list.every((s) => STATUSES.includes(s))) throw bad(k);
        out.status = new Set(list);
        break;
      }
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        out.team = v;
        break;
      case 'dueBefore':
        if (!isRealDate(v)) throw bad(k);
        out.dueBefore = v;
        break;
      case 'sort': {
        const name = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(name)) throw bad(k);
        out.sort = { field: name, dir: v.startsWith('-') ? -1 : 1 };
        break;
      }
      case 'page':
      case 'pageSize': {
        if (!/^[0-9]+$/.test(v)) throw bad(k);
        const n = Number(v);
        if (n < 1 || (k === 'pageSize' && n > 100)) throw bad(k);
        out[k] = n;
        break;
      }
      case 'q':
        out.q = normalize(v);
        break;
      default:
        out[k] = v; // assignee, taskId
    }
  }
  return out;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function compare(sort) {
  const { field, dir } = sort;
  return (a, b) => {
    let c = 0;
    if (field === 'dueDate') {
      if (a.dueDate == null || b.dueDate == null) {
        if (a.dueDate == null && b.dueDate == null) c = 0;
        else return a.dueDate == null ? 1 : -1;
      } else c = (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) * dir;
    } else if (field === 'title') c = a.title.localeCompare(b.title, 'vi') * dir;
    else if (field === 'priority') c = (a.priority - b.priority) * dir;
    else c = (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) * dir;
    return c || idNum(a) - idNum(b);
  };
}

/** Lọc + sắp xếp (chưa phân trang). `user` quyết định phạm vi nhìn thấy. */
function selectTasks(store, user, q) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (q.status) items = items.filter((t) => q.status.has(t.status));
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee === null : t.assignee === q.assignee));
  if (q.team) items = items.filter((t) => t.team === q.team);
  if (q.q) items = items.filter((t) => normalize(t.title).includes(q.q));
  if (q.dueBefore) items = items.filter((t) => t.dueDate != null && t.dueDate <= q.dueBefore);
  return items.sort(compare(q.sort ?? { field: 'createdAt', dir: 1 }));
}

module.exports = { parseQuery, selectTasks, isRealDate, STATUSES };
