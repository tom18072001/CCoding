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
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function intIn(s, min, max) {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

function normalize(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

/** Phân tích query; lỗi báo tham số đầu tiên (theo lần xuất hiện đầu trên URL). */
function parseQuery(params, { paged }) {
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', ...(paged ? ['page', 'pageSize'] : [])];
  const count = new Map();
  for (const k of params.keys()) count.set(k, (count.get(k) || 0) + 1);
  const f = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  for (const [k, v] of params.entries()) {
    if (!allowed.includes(k) || count.get(k) > 1) throw bad(k);
    if (k === 'status') {
      const list = v.split(',');
      if (!list.every((x) => STATUSES.includes(x))) throw bad(k);
      f.status = list;
    } else if (k === 'assignee') f.assignee = v;
    else if (k === 'team') {
      if (!['A', 'B'].includes(v)) throw bad(k);
      f.team = v;
    } else if (k === 'q') f.q = normalize(v);
    else if (k === 'dueBefore') {
      if (!validDate(v)) throw bad(k);
      f.dueBefore = v;
    } else if (k === 'sort') {
      const name = v.startsWith('-') ? v.slice(1) : v;
      if (!SORTS.includes(name)) throw bad(k);
      f.sort = name;
      f.desc = v.startsWith('-');
    } else if (k === 'page') {
      f.page = intIn(v, 1, Infinity);
      if (f.page === null) throw bad(k);
    } else if (k === 'pageSize') {
      f.pageSize = intIn(v, 1, 100);
      if (f.pageSize === null) throw bad(k);
    }
  }
  return f;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

/** Lọc + sắp xếp (chưa phân trang). `user` quyết định phạm vi nhìn thấy. */
function selectTasks(store, user, f) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (f.status) items = items.filter((t) => f.status.includes(t.status));
  if (f.assignee !== undefined) items = items.filter((t) => (f.assignee === 'none' ? t.assignee === null || t.assignee === undefined : t.assignee === f.assignee));
  if (f.team) items = items.filter((t) => t.team === f.team);
  if (f.q) items = items.filter((t) => normalize(String(t.title)).includes(f.q));
  if (f.dueBefore) items = items.filter((t) => t.dueDate && t.dueDate <= f.dueBefore);
  const dir = f.desc ? -1 : 1;
  items.sort((a, b) => {
    let c = 0;
    if (f.sort === 'dueDate') {
      const an = !a.dueDate, bn = !b.dueDate;
      if (an !== bn) return an ? 1 : -1;
      if (!an) c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (f.sort === 'title') c = String(a.title).localeCompare(String(b.title), 'vi');
    else if (f.sort === 'priority') c = a.priority - b.priority;
    else c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    return c * dir || idNum(a) - idNum(b);
  });
  return items;
}

module.exports = { parseQuery, selectTasks };
