'use strict';

const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const TEAMS = ['A', 'B'];
const SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title'];
const BASE_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

function invalid(field, msg) {
  return new HttpError(400, 'INVALID_QUERY', msg, { field });
}

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parseIntStrict(s, min, max) {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < min || n > max) return null;
  return n;
}

function parseTaskQuery(searchParams, { paging = false } = {}) {
  const allowed = paging ? [...BASE_PARAMS, 'page', 'pageSize'] : BASE_PARAMS;
  const seen = new Set();
  const out = {};
  for (const [key, value] of searchParams) {
    if (!allowed.includes(key)) throw invalid(key, `Tham số không được hỗ trợ: ${key}`);
    if (seen.has(key)) throw invalid(key, `Tham số xuất hiện nhiều lần: ${key}`);
    seen.add(key);
    switch (key) {
      case 'status': {
        const parts = value.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw invalid(key, 'status không hợp lệ');
        out.status = parts;
        break;
      }
      case 'assignee':
        out.assignee = value;
        break;
      case 'team':
        if (!TEAMS.includes(value)) throw invalid(key, 'team không hợp lệ');
        out.team = value;
        break;
      case 'q':
        out.q = value;
        break;
      case 'dueBefore':
        if (!isRealDate(value)) throw invalid(key, 'dueBefore phải là ngày YYYY-MM-DD hợp lệ');
        out.dueBefore = value;
        break;
      case 'sort': {
        const f = value.startsWith('-') ? value.slice(1) : value;
        if (!SORT_FIELDS.includes(f)) throw invalid(key, 'sort không hợp lệ');
        out.sort = value;
        break;
      }
      case 'page': {
        const n = parseIntStrict(value, 1, Infinity);
        if (n === null) throw invalid(key, 'page phải là số nguyên ≥ 1');
        out.page = n;
        break;
      }
      case 'pageSize': {
        const n = parseIntStrict(value, 1, 100);
        if (n === null) throw invalid(key, 'pageSize phải là số nguyên 1–100');
        out.pageSize = n;
        break;
      }
    }
  }
  return out;
}

function normalize(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

function idNum(id) {
  const m = /(\d+)\s*$/.exec(String(id));
  return m ? Number(m[1]) : 0;
}

function applyTaskQuery(tasks, parsed = {}, { paging = false, forceTeam } = {}) {
  let list = tasks.filter((t) => {
    if (forceTeam && t.team !== forceTeam) return false;
    if (parsed.status && !parsed.status.includes(t.status)) return false;
    if (parsed.team && t.team !== parsed.team) return false;
    if (parsed.assignee !== undefined) {
      if (parsed.assignee === 'none' ? t.assignee != null : t.assignee !== parsed.assignee) return false;
    }
    if (parsed.dueBefore && !(t.dueDate != null && t.dueDate <= parsed.dueBefore)) return false;
    if (parsed.q) {
      if (!normalize(t.title == null ? '' : t.title).includes(normalize(parsed.q))) return false;
    }
    return true;
  });

  const sort = parsed.sort || 'createdAt';
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const dir = desc ? -1 : 1;
  list = list.slice().sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (field === 'dueDate') {
      const an = av == null;
      const bn = bv == null;
      if (an && !bn) return 1;
      if (!an && bn) return -1;
    }
    let c = 0;
    if (!(av == null && bv == null)) {
      if (field === 'title') c = String(av).localeCompare(String(bv), 'vi');
      else if (av == null) c = -1;
      else if (bv == null) c = 1;
      else c = av < bv ? -1 : av > bv ? 1 : 0;
    }
    if (c !== 0) return c * dir;
    return idNum(a.id) - idNum(b.id);
  });

  const total = list.length;
  if (!paging) return { items: list, total };
  const page = parsed.page || 1;
  const pageSize = parsed.pageSize || 20;
  const start = (page - 1) * pageSize;
  return { items: list.slice(start, start + pageSize), total, page, pageSize };
}

module.exports = { parseTaskQuery, applyTaskQuery };
