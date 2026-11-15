'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

const idNum = (id) => Number(String(id).replace(/\D/g, '')) || 0;

/** Phân tích query theo thứ tự xuất hiện; lỗi đầu tiên được báo. */
function parseTaskQuery(searchParams, { paging }) {
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', ...(paging ? ['page', 'pageSize'] : [])];
  const seen = new Set();
  const f = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  for (const [k, v] of searchParams.entries()) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k);
        f.status = parts;
        break;
      }
      case 'assignee':
        f.assignee = v;
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        f.team = v;
        break;
      case 'q':
        f.q = fold(v);
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        f.dueBefore = v;
        break;
      case 'sort': {
        const desc = v.startsWith('-');
        const field = desc ? v.slice(1) : v;
        if (!SORTS.includes(field)) throw bad(k);
        f.sort = field;
        f.desc = desc;
        break;
      }
      case 'page':
        if (!/^[0-9]+$/.test(v) || Number(v) < 1) throw bad(k);
        f.page = Number(v);
        break;
      case 'pageSize':
        if (!/^[0-9]+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k);
        f.pageSize = Number(v);
        break;
    }
  }
  return f;
}

/** Lọc + sắp xếp danh sách nhiệm vụ (đã giới hạn theo quyền đọc nếu có forceTeam). */
function applyTaskQuery(tasks, f, forceTeam) {
  let items = tasks.filter((t) => {
    if (forceTeam && t.team !== forceTeam) return false;
    if (f.status && !f.status.includes(t.status)) return false;
    if (f.assignee !== undefined && (f.assignee === 'none' ? t.assignee != null : t.assignee !== f.assignee)) return false;
    if (f.team && t.team !== f.team) return false;
    if (f.q && !fold(t.title).includes(f.q)) return false;
    if (f.dueBefore && !(t.dueDate != null && t.dueDate <= f.dueBefore)) return false;
    return true;
  });
  const dir = f.desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    if (f.sort === 'dueDate') {
      if (a.dueDate == null || b.dueDate == null) {
        if (a.dueDate == null && b.dueDate == null) c = 0;
        else return a.dueDate == null ? 1 : -1;
      } else c = (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) * dir;
    } else if (f.sort === 'priority') c = (a.priority - b.priority) * dir;
    else if (f.sort === 'title') c = String(a.title).localeCompare(String(b.title), 'vi') * dir;
    else c = (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) * dir;
    return c || idNum(a.id) - idNum(b.id);
  };
  items = items.sort(cmp);
  return items;
}

function toCsv(items) {
  const cols = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(','), ...items.map((t) => cols.map((c) => cell(t[c])).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { parseTaskQuery, applyTaskQuery, toCsv };
