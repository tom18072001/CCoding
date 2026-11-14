'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const FILTER_KEYS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];
const PAGE_KEYS = ['page', 'pageSize'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Phân tích query của danh sách/xuất CSV. Lỗi báo tham số đầu tiên theo thứ tự xuất hiện trên URL. */
function parseListQuery(params, { paged }) {
  const allowed = paged ? [...FILTER_KEYS, ...PAGE_KEYS] : FILTER_KEYS;
  const seen = new Map();
  for (const [k] of params) seen.set(k, (seen.get(k) || 0) + 1);
  const q = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  for (const k of seen.keys()) {
    if (!allowed.includes(k) && !(k === 'page' || k === 'pageSize')) throw bad(k);
    if (!allowed.includes(k) || seen.get(k) > 1) throw bad(k);
    const v = params.get(k);
    switch (k) {
      case 'status': {
        const list = v.split(',');
        if (!list.every((s) => STATUSES.includes(s))) throw bad(k);
        q.status = list;
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
        q.q = normalize(v);
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        q.dueBefore = v;
        break;
      case 'sort': {
        const name = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(name)) throw bad(k);
        q.sort = name;
        q.desc = v.startsWith('-');
        break;
      }
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1 || !Number.isSafeInteger(Number(v))) throw bad(k);
        q.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k);
        q.pageSize = Number(v);
        break;
    }
  }
  return q;
}

function normalize(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function applyQuery(tasks, q) {
  let items = tasks.filter((t) => {
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined && (q.assignee === 'none' ? t.assignee !== null && t.assignee !== undefined : t.assignee !== q.assignee)) return false;
    if (q.team && t.team !== q.team) return false;
    if (q.q && !normalize(t.title).includes(q.q)) return false;
    if (q.dueBefore && !(t.dueDate && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const dir = q.desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    switch (q.sort) {
      case 'createdAt':
        c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
        break;
      case 'priority':
        c = a.priority - b.priority;
        break;
      case 'title':
        c = a.title.localeCompare(b.title, 'vi');
        break;
      case 'dueDate': {
        if (!a.dueDate || !b.dueDate) {
          if (!a.dueDate && !b.dueDate) return idNum(a) - idNum(b);
          return a.dueDate ? -1 : 1; // không có dueDate luôn cuối
        }
        c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
        break;
      }
    }
    return c * dir || idNum(a) - idNum(b);
  };
  items = items.sort(cmp);
  return items;
}

module.exports = { parseListQuery, applyQuery };
