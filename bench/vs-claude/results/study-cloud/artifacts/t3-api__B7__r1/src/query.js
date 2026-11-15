'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function intIn(v, min, max) {
  if (!/^[0-9]+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

/** Phân tích query theo thứ tự xuất hiện; lỗi đầu tiên được báo. */
function parseQuery(params, { paged }) {
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'].concat(paged ? ['page', 'pageSize'] : []);
  const out = { filters: {}, sort: 'createdAt', page: 1, pageSize: 20 };
  const seen = new Set();
  for (const [k, v] of params) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const list = v.split(',');
        if (!list.every((x) => STATUSES.includes(x))) throw bad(k);
        out.filters.status = list;
        break;
      }
      case 'assignee':
        out.filters.assignee = v;
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        out.filters.team = v;
        break;
      case 'q':
        if (v !== '') out.filters.q = fold(v);
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        out.filters.dueBefore = v;
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

function filterTasks(tasks, f) {
  return tasks.filter((t) => {
    if (f.status && !f.status.includes(t.status)) return false;
    if (f.assignee !== undefined && (f.assignee === 'none' ? t.assignee != null : t.assignee !== f.assignee)) return false;
    if (f.team && t.team !== f.team) return false;
    if (f.q !== undefined && !fold(t.title).includes(f.q)) return false;
    if (f.dueBefore && !(t.dueDate && t.dueDate <= f.dueBefore)) return false;
    return true;
  });
}

const num = (id) => Number(String(id).replace(/\D/g, ''));

function sortTasks(tasks, sort) {
  const dir = sort.startsWith('-') ? -1 : 1;
  const key = sort.replace(/^-/, '');
  const cmp = (a, b) => {
    if (key === 'dueDate' && (a.dueDate == null || b.dueDate == null)) {
      if (a.dueDate == null && b.dueDate == null) return num(a.id) - num(b.id);
      return a.dueDate == null ? 1 : -1;
    }
    let c;
    if (key === 'title') c = a.title.localeCompare(b.title, 'vi');
    else if (key === 'priority') c = a.priority - b.priority;
    else c = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
    return c !== 0 ? c * dir : num(a.id) - num(b.id);
  };
  return [...tasks].sort(cmp);
}

const COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[,"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(tasks) {
  const lines = [COLS.join(','), ...tasks.map((t) => COLS.map((c) => cell(t[c])).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { parseQuery, filterTasks, sortTasks, toCsv, fold };
