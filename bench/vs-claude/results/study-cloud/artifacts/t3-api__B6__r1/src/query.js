'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const TEAMS = ['A', 'B'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const BASE_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

function bad(field, msg) {
  return new HttpError(400, 'INVALID_QUERY', msg, { field });
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parseQuery(searchParams, { paginate = true } = {}) {
  const allowed = paginate ? [...BASE_PARAMS, 'page', 'pageSize'] : BASE_PARAMS;
  const out = { status: null, assignee: null, team: null, q: null, dueBefore: null, sort: { field: 'createdAt', desc: false }, page: 1, pageSize: 20 };
  const seen = new Set();
  for (const [key, value] of searchParams.entries()) {
    if (!allowed.includes(key)) throw bad(key, `Tham số không hợp lệ: ${key}`);
    if (seen.has(key)) throw bad(key, `Tham số lặp: ${key}`);
    seen.add(key);
    switch (key) {
      case 'status': {
        const parts = value.split(',');
        if (parts.some((p) => !STATUSES.includes(p))) throw bad(key, 'status không hợp lệ');
        out.status = [...new Set(parts)];
        break;
      }
      case 'assignee':
        if (value === '') throw bad(key, 'assignee không được rỗng');
        out.assignee = value;
        break;
      case 'team':
        if (!TEAMS.includes(value)) throw bad(key, 'team phải là A hoặc B');
        out.team = value;
        break;
      case 'q':
        out.q = value === '' ? null : value;
        break;
      case 'dueBefore':
        if (!validDate(value)) throw bad(key, 'dueBefore phải là ngày YYYY-MM-DD hợp lệ');
        out.dueBefore = value;
        break;
      case 'sort': {
        const desc = value.startsWith('-');
        const field = desc ? value.slice(1) : value;
        if (!SORTS.includes(field)) throw bad(key, 'sort không hợp lệ');
        out.sort = { field, desc };
        break;
      }
      case 'page': {
        if (!/^\d+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) throw bad(key, 'page phải là số nguyên ≥ 1');
        out.page = Number(value);
        break;
      }
      case 'pageSize': {
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100) throw bad(key, 'pageSize phải là số nguyên 1–100');
        out.pageSize = Number(value);
        break;
      }
    }
  }
  return out;
}

function normalize(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

function idNum(id) {
  return Number(String(id).replace(/\D/g, '')) || 0;
}

function applyQuery(tasks, parsed, { teamScope = null, paginate = true } = {}) {
  const q = parsed.q ? normalize(parsed.q) : null;
  let list = tasks.filter((t) => {
    if (teamScope && t.team !== teamScope) return false;
    if (parsed.status && !parsed.status.includes(t.status)) return false;
    if (parsed.assignee !== null && parsed.assignee !== undefined) {
      if (parsed.assignee === 'none') { if (t.assignee != null) return false; }
      else if (t.assignee !== parsed.assignee) return false;
    }
    if (parsed.team && t.team !== parsed.team) return false;
    if (q && !normalize(t.title ?? '').includes(q)) return false;
    if (parsed.dueBefore) {
      if (!t.dueDate || t.dueDate > parsed.dueBefore) return false;
    }
    return true;
  });
  const { field, desc } = parsed.sort || { field: 'createdAt', desc: false };
  const sign = desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    if (field === 'dueDate') {
      const ea = a.dueDate == null;
      const eb = b.dueDate == null;
      if (ea || eb) {
        if (ea && eb) return idNum(a.id) - idNum(b.id);
        return ea ? 1 : -1; // thiếu dueDate luôn cuối
      }
      c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (field === 'title') {
      c = String(a.title ?? '').localeCompare(String(b.title ?? ''), 'vi');
    } else if (field === 'priority') {
      c = (a.priority ?? 0) - (b.priority ?? 0);
    } else {
      const x = a[field] ?? '';
      const y = b[field] ?? '';
      c = x < y ? -1 : x > y ? 1 : 0;
    }
    return c * sign || idNum(a.id) - idNum(b.id);
  };
  list = list.slice().sort(cmp);
  const total = list.length;
  if (paginate) {
    const page = parsed.page ?? 1;
    const size = parsed.pageSize ?? 20;
    list = list.slice((page - 1) * size, page * size);
  }
  return { items: list, total };
}

module.exports = { parseQuery, applyQuery };
