'use strict';
const { HttpError } = require('../http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];

function invalidQuery(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function fold(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

function idNum(id) {
  return Number(String(id).replace(/\D/g, '')) || 0;
}

/** Phân tích query theo thứ tự xuất hiện trên URL; ném INVALID_QUERY cho tham số lỗi đầu tiên. */
function parseListQuery(query, { paged }) {
  const allowed = paged ? LIST_PARAMS : LIST_PARAMS.filter((p) => p !== 'page' && p !== 'pageSize');
  const f = { sort: 'createdAt', page: 1, pageSize: 20 };
  const seen = new Set();
  for (const [k, v] of query.entries()) {
    if (!allowed.includes(k) || seen.has(k)) throw invalidQuery(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const vals = v.split(',');
        if (!vals.every((x) => STATUSES.includes(x))) throw invalidQuery(k);
        f.status = vals;
        break;
      }
      case 'assignee':
        f.assignee = v;
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw invalidQuery(k);
        f.team = v;
        break;
      case 'q':
        f.q = v;
        break;
      case 'dueBefore':
        if (!validDate(v)) throw invalidQuery(k);
        f.dueBefore = v;
        break;
      case 'sort': {
        const field = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(field)) throw invalidQuery(k);
        f.sort = v;
        break;
      }
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1 || !Number.isSafeInteger(Number(v))) throw invalidQuery(k);
        f.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw invalidQuery(k);
        f.pageSize = Number(v);
        break;
    }
  }
  return f;
}

function queryTasks(store, user, f) {
  const desc = f.sort.startsWith('-');
  const field = desc ? f.sort.slice(1) : f.sort;
  const q = f.q ? fold(f.q) : '';
  const items = store.listTasks().filter((t) => {
    if (user.role === 'member' && t.team !== user.team) return false;
    if (f.status && !f.status.includes(t.status)) return false;
    if (f.assignee !== undefined) {
      const none = t.assignee === null || t.assignee === undefined;
      if (f.assignee === 'none' ? !none : t.assignee !== f.assignee) return false;
    }
    if (f.team && t.team !== f.team) return false;
    if (q && !fold(t.title).includes(q)) return false;
    if (f.dueBefore && !(t.dueDate && t.dueDate <= f.dueBefore)) return false;
    return true;
  });
  const dir = desc ? -1 : 1;
  items.sort((a, b) => {
    let c = 0;
    if (field === 'dueDate') {
      if (!a.dueDate !== !b.dueDate) return a.dueDate ? -1 : 1;
      c = !a.dueDate ? 0 : a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (field === 'title') c = a.title.localeCompare(b.title, 'vi');
    else c = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
    return c * dir || idNum(a.id) - idNum(b.id);
  });
  return items;
}

const CSV_COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(items) {
  const lines = [CSV_COLS.join(','), ...items.map((t) => CSV_COLS.map((c) => csvCell(t[c])).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { parseListQuery, queryTasks, toCsv };
