'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 100) dt.setUTCFullYear(y);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function int(s, min, max) {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

const PARSERS = {
  status(v) {
    const list = v.split(',');
    if (!list.every((x) => STATUSES.includes(x))) return undefined;
    return list;
  },
  assignee: (v) => v,
  team: (v) => (v === 'A' || v === 'B' ? v : undefined),
  q: (v) => v,
  dueBefore: (v) => (validDate(v) ? v : undefined),
  sort(v) {
    const f = v.startsWith('-') ? v.slice(1) : v;
    return SORTS.includes(f) ? { field: f, dir: v.startsWith('-') ? -1 : 1 } : undefined;
  },
  page: (v) => int(v, 1, Infinity) ?? undefined,
  pageSize: (v) => int(v, 1, 100) ?? undefined,
};

/**
 * Phân tích query theo thứ tự xuất hiện trên URL. `allowed`: danh sách tham số được phép.
 * Tham số lạ, lặp, hoặc giá trị sai → 400 INVALID_QUERY (tham số đầu tiên gặp lỗi).
 */
function parseQuery(searchParams, allowed) {
  const out = {};
  const seen = new Set();
  for (const [k, v] of searchParams) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    if (k === 'taskId') {
      out[k] = v;
      continue;
    }
    const parsed = PARSERS[k](v);
    if (parsed === undefined) throw bad(k);
    out[k] = parsed;
  }
  return out;
}

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function applyFilters(tasks, f) {
  const q = f.q ? norm(f.q) : '';
  return tasks.filter((t) => {
    if (f.status && !f.status.includes(t.status)) return false;
    if (f.assignee !== undefined && (f.assignee === 'none' ? t.assignee !== null : t.assignee !== f.assignee)) return false;
    if (f.team && t.team !== f.team) return false;
    if (q && !norm(t.title).includes(q)) return false;
    if (f.dueBefore && !(t.dueDate && t.dueDate <= f.dueBefore)) return false;
    return true;
  });
}

function applySort(tasks, sort) {
  const { field, dir } = sort || { field: 'createdAt', dir: 1 };
  const cmp = (a, b) => {
    if (field === 'dueDate') {
      const an = a.dueDate == null, bn = b.dueDate == null;
      if (an || bn) return an && bn ? 0 : an ? 1 : -1; // null luôn cuối
    }
    let c;
    if (field === 'title') c = String(a.title).localeCompare(String(b.title), 'vi');
    else c = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
    return c * dir;
  };
  return [...tasks].sort((a, b) => cmp(a, b) || idNum(a) - idNum(b));
}

module.exports = { parseQuery, applyFilters, applySort };
