'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const BASE = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function fold(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'D').toLowerCase();
}

/** Phân tích và kiểm tra tham số truy vấn theo thứ tự xuất hiện. */
function listQuery(params, { paged }) {
  const allowed = paged ? [...BASE, 'page', 'pageSize'] : BASE;
  const q = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  const seen = new Set();
  for (const [k, v] of params) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
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
      case 'q': q.q = fold(v); break;
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
        if (n < 1 || (k === 'pageSize' && n > 100) || !Number.isSafeInteger(n)) throw bad(k);
        q[k] = n;
        break;
      }
    }
  }
  return q;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function applyQuery(tasks, q) {
  const r = tasks.filter((t) => {
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined && (q.assignee === 'none' ? t.assignee != null : t.assignee !== q.assignee)) return false;
    if (q.team && t.team !== q.team) return false;
    if (q.q && !fold(String(t.title)).includes(q.q)) return false;
    if (q.dueBefore && !(t.dueDate && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const dir = q.desc ? -1 : 1;
  return r.sort((a, b) => {
    let c = 0;
    if (q.sort === 'dueDate') {
      if (!a.dueDate !== !b.dueDate) return a.dueDate ? -1 : 1;
      if (a.dueDate) c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (q.sort === 'title') c = String(a.title).localeCompare(String(b.title), 'vi');
    else if (q.sort === 'priority') c = a.priority - b.priority;
    else c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    return c ? c * dir : idNum(a) - idNum(b);
  });
}

function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(tasks) {
  const cols = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];
  const lines = [cols.join(','), ...tasks.map((t) => cols.map((c) => cell(t[c])).join(','))];
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

module.exports = { listQuery, applyQuery, toCsv, fold };
