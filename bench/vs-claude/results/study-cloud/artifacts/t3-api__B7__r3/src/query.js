'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Danh sách khóa theo thứ tự xuất hiện đầu tiên trên URL, kèm số lần xuất hiện. */
function keysInOrder(searchParams) {
  const order = [];
  const counts = new Map();
  for (const [k] of searchParams) {
    if (!counts.has(k)) order.push(k);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return { order, counts };
}

function parseListQuery(searchParams, { paging }) {
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];
  if (paging) allowed.push('page', 'pageSize');
  const { order, counts } = keysInOrder(searchParams);
  const vals = {};
  for (const k of order) {
    if (!allowed.includes(k) || counts.get(k) > 1) throw bad(k);
    const v = searchParams.get(k);
    vals[k] = v;
    if (k === 'status') {
      const parts = v.split(',');
      if (!parts.every((x) => STATUSES.includes(x))) throw bad(k);
      vals.statusList = parts;
    } else if (k === 'team' && !['A', 'B'].includes(v)) throw bad(k);
    else if (k === 'dueBefore' && !validDate(v)) throw bad(k);
    else if (k === 'sort' && !SORTS.includes(v.replace(/^-/, ''))) throw bad(k);
    else if (k === 'page' && !(/^\d+$/.test(v) && Number.isSafeInteger(Number(v)) && Number(v) >= 1)) throw bad(k);
    else if (k === 'pageSize' && !(/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 100)) throw bad(k);
  }
  return {
    status: vals.statusList,
    assignee: vals.assignee,
    team: vals.team,
    q: vals.q ? fold(vals.q) : '',
    dueBefore: vals.dueBefore,
    sort: vals.sort || 'createdAt',
    page: vals.page ? Number(vals.page) : 1,
    pageSize: vals.pageSize ? Number(vals.pageSize) : 20,
  };
}

function parseAuditQuery(searchParams) {
  const { order, counts } = keysInOrder(searchParams);
  for (const k of order) if (k !== 'taskId' || counts.get(k) > 1) throw bad(k);
  return { taskId: searchParams.get('taskId') ?? undefined };
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, ''));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function queryTasks(all, user, q) {
  const items = all.filter((t) => {
    if (user.role === 'member' && t.team !== user.team) return false;
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined && (q.assignee === 'none' ? t.assignee != null : t.assignee !== q.assignee)) return false;
    if (q.team && t.team !== q.team) return false;
    if (q.q && !fold(t.title).includes(q.q)) return false;
    if (q.dueBefore && !(t.dueDate && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const dir = q.sort.startsWith('-') ? -1 : 1;
  const field = q.sort.replace(/^-/, '');
  items.sort((a, b) => {
    let c = 0;
    if (field === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an !== bn) return an ? 1 : -1;
      if (!an) c = cmp(a.dueDate, b.dueDate) * dir;
    } else if (field === 'title') c = a.title.localeCompare(b.title, 'vi') * dir;
    else c = cmp(a[field], b[field]) * dir;
    return c || idNum(a) - idNum(b);
  });
  return { items, total: items.length };
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

module.exports = { parseListQuery, parseAuditQuery, queryTasks, toCsv };
