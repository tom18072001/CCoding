'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const BASE = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

function authenticate(req, store) {
  const id = req.headers['x-user'];
  const user = typeof id === 'string' ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu hoặc sai X-User');
  return user;
}

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(2000, +m[2] - 1, +m[3]));
  d.setUTCFullYear(+m[1]);
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function parseQuery(query, { paged }) {
  const allowed = paged ? [...BASE, 'page', 'pageSize'] : BASE;
  const f = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  for (const k of new Set(query.keys())) {
    const vals = query.getAll(k);
    if (!allowed.includes(k) || vals.length > 1) throw bad(k);
    const v = vals[0];
    if (k === 'status') {
      const list = v.split(',');
      if (!list.every((x) => STATUSES.includes(x))) throw bad(k);
      f.status = list;
    } else if (k === 'assignee') f.assignee = v;
    else if (k === 'team') {
      if (!['A', 'B'].includes(v)) throw bad(k);
      f.team = v;
    } else if (k === 'q') f.q = v;
    else if (k === 'dueBefore') {
      if (!validDate(v)) throw bad(k);
      f.dueBefore = v;
    } else if (k === 'sort') {
      const name = v.startsWith('-') ? v.slice(1) : v;
      if (!SORTS.includes(name)) throw bad(k);
      f.sort = name;
      f.desc = v.startsWith('-');
    } else if (k === 'page') {
      if (!/^\d+$/.test(v) || Number(v) < 1 || !Number.isSafeInteger(Number(v))) throw bad(k);
      f.page = Number(v);
    } else if (k === 'pageSize') {
      if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k);
      f.pageSize = Number(v);
    }
  }
  return f;
}

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function applyQuery(tasks, f) {
  const q = f.q ? fold(f.q) : '';
  const out = tasks.filter((t) => {
    if (f.status && !f.status.includes(t.status)) return false;
    if (f.assignee !== undefined) {
      const none = t.assignee === null || t.assignee === undefined;
      if (f.assignee === 'none' ? !none : t.assignee !== f.assignee) return false;
    }
    if (f.team && t.team !== f.team) return false;
    if (q && !fold(String(t.title)).includes(q)) return false;
    if (f.dueBefore && !(t.dueDate && t.dueDate <= f.dueBefore)) return false;
    return true;
  });
  const dir = f.desc ? -1 : 1;
  const cmp = (a, b) => {
    if (f.sort === 'dueDate') {
      if (!a.dueDate !== !b.dueDate) return a.dueDate ? -1 : 1;
      if (!a.dueDate) return 0;
    }
    let c;
    if (f.sort === 'title') c = a.title.localeCompare(b.title, 'vi');
    else c = a[f.sort] < b[f.sort] ? -1 : a[f.sort] > b[f.sort] ? 1 : 0;
    return c * dir;
  };
  return out.sort((a, b) => cmp(a, b) || idNum(a) - idNum(b));
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

module.exports = { authenticate, parseQuery, applyQuery, toCsv };
