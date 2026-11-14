'use strict';
const { HttpError } = require('./http');

const ALLOWED = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const STATUSES = ['todo', 'doing', 'done'];
const SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field, msg) {
  return new HttpError(400, 'INVALID_QUERY', msg, { field });
}

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCFullYear(y);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parseListQuery(searchParams, { allowPaging = true } = {}) {
  const out = {
    filters: { status: null, assignee: undefined, team: undefined, q: '', dueBefore: undefined },
    sort: { field: 'createdAt', desc: false },
    page: 1,
    pageSize: 20,
  };
  const seen = new Set();
  for (const [key, value] of searchParams.entries()) {
    const known = ALLOWED.includes(key) && (allowPaging || (key !== 'page' && key !== 'pageSize'));
    if (!known) throw bad(key, `Tham số không hợp lệ: ${key}`);
    if (seen.has(key)) throw bad(key, `Tham số lặp: ${key}`);
    seen.add(key);
    switch (key) {
      case 'status': {
        const list = value.split(',');
        if (!list.every((s) => STATUSES.includes(s))) throw bad(key, 'status phải thuộc todo|doing|done');
        out.filters.status = list;
        break;
      }
      case 'assignee':
        if (value !== '') out.filters.assignee = value;
        break;
      case 'team':
        if (value !== 'A' && value !== 'B') throw bad(key, 'team phải là A hoặc B');
        out.filters.team = value;
        break;
      case 'q':
        out.filters.q = value;
        break;
      case 'dueBefore':
        if (!isRealDate(value)) throw bad(key, 'dueBefore phải là ngày YYYY-MM-DD hợp lệ');
        out.filters.dueBefore = value;
        break;
      case 'sort': {
        const desc = value.startsWith('-');
        const field = desc ? value.slice(1) : value;
        if (!SORT_FIELDS.includes(field)) throw bad(key, 'sort không hợp lệ');
        out.sort = { field, desc };
        break;
      }
      case 'page':
        if (!/^\d+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) throw bad(key, 'page phải là số nguyên >= 1');
        out.page = Number(value);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100) throw bad(key, 'pageSize phải là số nguyên 1-100');
        out.pageSize = Number(value);
        break;
    }
  }
  return out;
}

function normalize(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

function idNum(id) {
  const n = parseInt(String(id).replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function applyQuery(tasks, parsed, { forceTeam } = {}) {
  const f = parsed.filters || {};
  const q = f.q ? normalize(f.q) : '';
  let items = tasks.filter((t) => {
    if (f.status && !f.status.includes(t.status)) return false;
    if (f.assignee !== undefined && f.assignee !== null) {
      if (f.assignee === 'none') {
        if (t.assignee != null) return false;
      } else if (t.assignee !== f.assignee) return false;
    }
    if (f.team && t.team !== f.team) return false;
    if (forceTeam && t.team !== forceTeam) return false;
    if (q && !normalize(t.title || '').includes(q)) return false;
    if (f.dueBefore) {
      if (t.dueDate == null || t.dueDate > f.dueBefore) return false;
    }
    return true;
  });
  const { field, desc } = parsed.sort || { field: 'createdAt', desc: false };
  const dir = desc ? -1 : 1;
  items = items.slice().sort((a, b) => {
    const va = a[field];
    const vb = b[field];
    const na = va == null;
    const nb = vb == null;
    if (na && !nb) return 1;
    if (nb && !na) return -1;
    let c = 0;
    if (!na) {
      if (field === 'title') c = String(va).localeCompare(String(vb), 'vi');
      else if (field === 'priority') c = va - vb;
      else c = va < vb ? -1 : va > vb ? 1 : 0;
    }
    if (c !== 0) return c * dir;
    return idNum(a.id) - idNum(b.id);
  });
  return { items, total: items.length };
}

function paginate(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

const CSV_COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(tasks) {
  const lines = [CSV_COLS.join(',')];
  for (const t of tasks) lines.push(CSV_COLS.map((c) => csvCell(t[c])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { parseListQuery, applyQuery, paginate, toCsv };
