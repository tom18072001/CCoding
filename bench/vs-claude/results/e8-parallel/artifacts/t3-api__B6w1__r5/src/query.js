'use strict';
const { HttpError } = require('./http');

const ALLOWED = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize'];
const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field, msg) {
  return new HttpError(400, 'INVALID_QUERY', msg, { field });
}

function normalize(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parseListQuery(searchParams, { paginate = true } = {}) {
  const allowed = paginate ? ALLOWED : ALLOWED.filter((k) => k !== 'page' && k !== 'pageSize');
  const seen = new Set();
  for (const key of searchParams.keys()) {
    if (!allowed.includes(key)) throw bad(key, `Tham số không hợp lệ: ${key}`);
    if (seen.has(key)) throw bad(key, `Tham số trùng lặp: ${key}`);
    seen.add(key);
    const v = searchParams.get(key);
    switch (key) {
      case 'status':
        if (!v.split(',').every((x) => STATUSES.includes(x))) throw bad(key, 'status phải thuộc todo|doing|done');
        break;
      case 'team':
        if (v !== 'A' && v !== 'B') throw bad(key, 'team phải là A hoặc B');
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(key, 'dueBefore phải có dạng YYYY-MM-DD hợp lệ');
        break;
      case 'sort':
        if (!SORTS.includes(v.startsWith('-') ? v.slice(1) : v)) throw bad(key, 'sort không hợp lệ');
        break;
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1) throw bad(key, 'page phải là số nguyên ≥ 1');
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(key, 'pageSize phải từ 1 đến 100');
        break;
      default:
    }
  }
  const g = (k) => (searchParams.has(k) ? searchParams.get(k) : undefined);
  const filters = {};
  if (g('status') !== undefined) filters.status = g('status').split(',');
  if (g('assignee') !== undefined && g('assignee') !== '') filters.assignee = g('assignee');
  if (g('team') !== undefined) filters.team = g('team');
  if (g('q')) filters.q = g('q');
  if (g('dueBefore') !== undefined) filters.dueBefore = g('dueBefore');
  const sort = g('sort') || 'createdAt';
  return {
    filters,
    sort,
    page: g('page') !== undefined ? Number(g('page')) : 1,
    pageSize: g('pageSize') !== undefined ? Number(g('pageSize')) : 20,
    paginate,
  };
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function applyQuery(tasks, parsed) {
  const { filters, sort, page, pageSize } = parsed;
  const paginate = parsed.paginate !== false;
  let list = tasks.filter((t) => {
    if (filters.status && !filters.status.includes(t.status)) return false;
    if (filters.assignee !== undefined) {
      if (filters.assignee === 'none') {
        if (t.assignee != null) return false;
      } else if (t.assignee !== filters.assignee) return false;
    }
    if (filters.team && t.team !== filters.team) return false;
    if (filters.q && !normalize(t.title || '').includes(normalize(filters.q))) return false;
    if (filters.dueBefore && !(t.dueDate && t.dueDate.slice(0, 10) <= filters.dueBefore)) return false;
    return true;
  });
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const dir = desc ? -1 : 1;
  list = list.slice().sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (field === 'dueDate') {
      const an = av == null;
      const bn = bv == null;
      if (an !== bn) return an ? 1 : -1;
    }
    let c = 0;
    if (av != null && bv != null) {
      if (field === 'title') c = String(av).localeCompare(String(bv), 'vi');
      else c = av < bv ? -1 : av > bv ? 1 : 0;
    }
    if (c !== 0) return c * dir;
    return idNum(a) - idNum(b);
  });
  const total = list.length;
  if (!paginate) return { items: list, total, page: 1, pageSize: total };
  const start = (page - 1) * pageSize;
  return { items: list.slice(start, start + pageSize), total, page, pageSize };
}

module.exports = { parseListQuery, applyQuery };
