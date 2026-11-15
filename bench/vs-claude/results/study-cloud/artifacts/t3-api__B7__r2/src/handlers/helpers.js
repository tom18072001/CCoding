'use strict';
const { HttpError } = require('../http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = id ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/** Duyệt tham số theo thứ tự xuất hiện; lỗi đầu tiên (tên lạ, lặp, giá trị sai) quyết định field. */
function parseQuery(sp, allowed, { audit = false } = {}) {
  const out = {};
  const seen = new Set();
  const counts = new Map();
  for (const [k] of sp) counts.set(k, (counts.get(k) || 0) + 1);
  for (const [k, v] of sp) {
    if (seen.has(k)) continue;
    seen.add(k);
    if (!allowed.includes(k) || counts.get(k) > 1) throw bad(k);
    if (audit) {
      out.taskId = v;
      continue;
    }
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k);
        out.status = parts;
        break;
      }
      case 'assignee': out.assignee = v; break;
      case 'team': if (v !== 'A' && v !== 'B') throw bad(k); out.team = v; break;
      case 'q': out.q = v; break;
      case 'dueBefore': if (!validDate(v)) throw bad(k); out.dueBefore = v; break;
      case 'sort': {
        const f = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw bad(k);
        out.sort = v;
        break;
      }
      case 'page': if (!/^\d+$/.test(v) || Number(v) < 1) throw bad(k); out.page = Number(v); break;
      case 'pageSize': if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k); out.pageSize = Number(v); break;
    }
  }
  out.page = out.page ?? 1;
  out.pageSize = out.pageSize ?? 20;
  return out;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function filterAndSort(tasks, q, user) {
  const needle = q.q ? fold(q.q) : '';
  let items = tasks.filter((t) => {
    if (user.role === 'member' && t.team !== user.team) return false;
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined && (q.assignee === 'none' ? t.assignee != null : t.assignee !== q.assignee)) return false;
    if (q.team && t.team !== q.team) return false;
    if (needle && !fold(t.title).includes(needle)) return false;
    if (q.dueBefore && !(t.dueDate && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const sort = q.sort || 'createdAt';
  const desc = sort.startsWith('-');
  const f = desc ? sort.slice(1) : sort;
  const dir = desc ? -1 : 1;
  return items.sort((a, b) => {
    let c = 0;
    if (f === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an !== bn) return an ? 1 : -1;
      if (!an) c = (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) * dir;
    } else if (f === 'title') c = a.title.localeCompare(b.title, 'vi') * dir;
    else c = (a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : 0) * dir;
    return c || idNum(a) - idNum(b);
  });
}

const COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(items) {
  const lines = [COLS.join(','), ...items.map((t) => COLS.map((c) => cell(t[c])).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { authenticate, parseQuery, filterAndSort, toCsv, fold };
