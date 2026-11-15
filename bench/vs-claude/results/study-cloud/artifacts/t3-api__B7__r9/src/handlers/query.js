'use strict';
const { HttpError } = require('../http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const LIST_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

/** Bỏ dấu tiếng Việt, hạ chữ thường. */
function fold(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
}

function validDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function intIn(v, min, max) {
  if (!/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : undefined;
}

/** Phân tích tham số truy vấn theo thứ tự xuất hiện; lỗi đầu tiên được báo. */
function listQuery(params, { paged }) {
  const allowed = paged ? LIST_PARAMS : LIST_PARAMS.filter((k) => k !== 'page' && k !== 'pageSize');
  const q = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  const seen = new Set();
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
        if (v !== 'A' && v !== 'B') throw bad(k);
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
        const f = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw bad(k);
        q.sort = f;
        q.desc = v.startsWith('-');
        break;
      }
      case 'page': {
        const n = intIn(v, 1, Infinity);
        if (n === undefined) throw bad(k);
        q.page = n;
        break;
      }
      case 'pageSize': {
        const n = intIn(v, 1, 100);
        if (n === undefined) throw bad(k);
        q.pageSize = n;
        break;
      }
    }
  }
  return q;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, ''));

function selectTasks(store, user, q) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (q.status) items = items.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee == null : t.assignee === q.assignee));
  if (q.team) items = items.filter((t) => t.team === q.team);
  if (q.q) items = items.filter((t) => fold(String(t.title)).includes(q.q));
  if (q.dueBefore) items = items.filter((t) => t.dueDate != null && t.dueDate <= q.dueBefore);
  const dir = q.desc ? -1 : 1;
  const cmp = (a, b) => {
    const x = a[q.sort];
    const y = b[q.sort];
    if (q.sort === 'dueDate') {
      if (x == null && y != null) return 1;
      if (y == null && x != null) return -1;
    }
    let c = 0;
    if (x != null && y != null) {
      if (q.sort === 'title') c = x.localeCompare(y, 'vi');
      else c = x < y ? -1 : x > y ? 1 : 0;
    }
    return c * dir || idNum(a) - idNum(b);
  };
  return items.sort(cmp);
}

const COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return String(v);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function toCsv(tasks) {
  const lines = [COLS.join(','), ...tasks.map((t) => COLS.map((c) => cell(t[c])).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { listQuery, selectTasks, toCsv, fold };
