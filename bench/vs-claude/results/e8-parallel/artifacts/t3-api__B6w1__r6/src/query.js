'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title'];
const BASE_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

const bad = (field) => new HttpError(400, 'INVALID_QUERY', { field });

function normalize(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function intIn(v, min, max, field) {
  if (!/^\d+$/.test(v)) throw bad(field);
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw bad(field);
  return n;
}

const decode = (s) => new URLSearchParams(`k=${s}`).get('k');

/** Phân tích query string của req.url. Ném HttpError(400,'INVALID_QUERY',{field}). */
function parseListQuery(rawUrl, { paging = true } = {}) {
  const url = String(rawUrl);
  const i = url.indexOf('?');
  let qs = i >= 0 ? url.slice(i + 1) : '';
  const h = qs.indexOf('#');
  if (h >= 0) qs = qs.slice(0, h);
  const allowed = paging ? [...BASE_PARAMS, 'page', 'pageSize'] : BASE_PARAMS;
  const parsed = { status: null, assignee: null, team: null, q: '', dueBefore: null, sort: { field: 'createdAt', desc: false } };
  if (paging) {
    parsed.page = 1;
    parsed.pageSize = 20;
  }
  const seen = new Set();
  for (const part of qs.split('&')) {
    if (part === '') continue;
    const eq = part.indexOf('=');
    const key = decode(eq >= 0 ? part.slice(0, eq) : part);
    const v = eq >= 0 ? decode(part.slice(eq + 1)) : '';
    if (!allowed.includes(key) || seen.has(key)) throw bad(key);
    seen.add(key);
    switch (key) {
      case 'status': {
        const list = v.split(',');
        if (!list.every((s) => STATUSES.includes(s))) throw bad(key);
        parsed.status = list;
        break;
      }
      case 'assignee':
        if (v === '') throw bad(key);
        parsed.assignee = v;
        break;
      case 'team':
        if (v !== 'A' && v !== 'B') throw bad(key);
        parsed.team = v;
        break;
      case 'q':
        parsed.q = normalize(v);
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(key);
        parsed.dueBefore = v;
        break;
      case 'sort': {
        const desc = v.startsWith('-');
        const field = desc ? v.slice(1) : v;
        if (!SORT_FIELDS.includes(field)) throw bad(key);
        parsed.sort = { field, desc };
        break;
      }
      case 'page':
        parsed.page = intIn(v, 1, Number.MAX_SAFE_INTEGER, key);
        break;
      case 'pageSize':
        parsed.pageSize = intIn(v, 1, 100, key);
        break;
    }
  }
  return parsed;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

/** Lọc + sắp xếp (+ phân trang nếu parsed có page). Trả { items, total }. */
function applyQuery(tasks, parsed, { forceTeam } = {}) {
  let list = tasks.filter((t) => {
    if (forceTeam && t.team !== forceTeam) return false;
    if (parsed.team && t.team !== parsed.team) return false;
    if (parsed.status && !parsed.status.includes(t.status)) return false;
    if (parsed.assignee !== null && parsed.assignee !== undefined) {
      if (parsed.assignee === 'none') {
        if (t.assignee != null) return false;
      } else if (t.assignee !== parsed.assignee) return false;
    }
    if (parsed.q && !normalize(t.title ?? '').includes(parsed.q)) return false;
    if (parsed.dueBefore && !(t.dueDate != null && t.dueDate <= parsed.dueBefore)) return false;
    return true;
  });
  const { field, desc } = parsed.sort;
  const dir = desc ? -1 : 1;
  list = list.slice().sort((a, b) => {
    let c = 0;
    const x = a[field];
    const y = b[field];
    if (field === 'dueDate') {
      if (x == null && y != null) return 1;
      if (x != null && y == null) return -1;
      if (x != null) c = x < y ? -1 : x > y ? 1 : 0;
    } else if (field === 'title') {
      c = String(x ?? '').localeCompare(String(y ?? ''), 'vi');
    } else if (field === 'priority') {
      c = Number(x) - Number(y) || 0;
    } else {
      c = x < y ? -1 : x > y ? 1 : 0;
    }
    return c * dir || idNum(a) - idNum(b);
  });
  const total = list.length;
  if (parsed.page !== undefined) {
    const start = (parsed.page - 1) * parsed.pageSize;
    list = list.slice(start, start + parsed.pageSize);
  }
  return { items: list, total };
}

module.exports = { parseListQuery, applyQuery };
