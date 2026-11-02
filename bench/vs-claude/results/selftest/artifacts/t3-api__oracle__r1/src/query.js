'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function intIn(s, lo, hi) {
  if (!/^\d+$/.test(s)) return undefined;
  const n = Number(s);
  return n >= lo && n <= hi ? n : undefined;
}

/** Đọc tham số truy vấn theo thứ tự trên URL; allowed: danh sách tên được phép. */
function parseQuery(searchParams, allowed) {
  const out = {};
  const seen = new Set();
  for (const [k, v] of searchParams) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const list = v.split(',');
        if (!list.every((s) => STATUSES.includes(s))) throw bad(k);
        out.status = list;
        break;
      }
      case 'assignee':
        if (!v) throw bad(k);
        out.assignee = v;
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        out.team = v;
        break;
      case 'q':
        out.q = v;
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        out.dueBefore = v;
        break;
      case 'sort': {
        const desc = v.startsWith('-');
        const field = desc ? v.slice(1) : v;
        if (!SORTS.includes(field)) throw bad(k);
        out.sort = { field, desc };
        break;
      }
      case 'page':
        if ((out.page = intIn(v, 1, Number.MAX_SAFE_INTEGER)) === undefined) throw bad(k);
        break;
      case 'pageSize':
        if ((out.pageSize = intIn(v, 1, 100)) === undefined) throw bad(k);
        break;
      case 'taskId':
        out.taskId = v;
        break;
      default:
        throw bad(k);
    }
  }
  return out;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function applyQuery(tasks, q, user) {
  let list = tasks;
  if (user.role === 'member') list = list.filter((t) => t.team === user.team);
  if (q.status) list = list.filter((t) => q.status.includes(t.status));
  if (q.assignee) list = list.filter((t) => (q.assignee === 'none' ? t.assignee == null : t.assignee === q.assignee));
  if (q.team) list = list.filter((t) => t.team === q.team);
  if (q.q) {
    const needle = fold(q.q);
    list = list.filter((t) => fold(t.title).includes(needle));
  }
  if (q.dueBefore) list = list.filter((t) => t.dueDate && t.dueDate <= q.dueBefore);
  const { field, desc } = q.sort ?? { field: 'createdAt', desc: false };
  const cmp = (a, b) => {
    const av = a[field];
    const bv = b[field];
    if (field === 'dueDate') {
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
    }
    let c;
    if (field === 'title') c = String(av).localeCompare(String(bv), 'vi');
    else c = av < bv ? -1 : av > bv ? 1 : 0;
    if (field === 'dueDate' && (av == null || bv == null)) return c;
    return desc ? -c : c;
  };
  return [...list].sort((a, b) => cmp(a, b) || idNum(a) - idNum(b));
}

module.exports = { parseQuery, applyQuery, fold, STATUSES };
