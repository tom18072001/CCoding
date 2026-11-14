'use strict';
// Lọc / tìm / sắp xếp / phân trang danh sách nhiệm vụ (hàm thuần).

const ALLOWED = new Set(['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize']);
const STATUSES = new Set(['todo', 'doing', 'done']);
const SORTS = new Set(['createdAt', 'dueDate', 'priority', 'title']);

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(2000, mo - 1, d));
  dt.setUTCFullYear(y);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function normalize(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

function parseListQuery(searchParams, { paged = true } = {}) {
  const f = { status: null, assignee: null, team: null, q: '', dueBefore: null, sort: 'createdAt', page: 1, pageSize: 20, paged: !!paged };
  const seen = new Set();
  for (const [k, v] of searchParams) {
    if (!ALLOWED.has(k) || seen.has(k) || (!paged && (k === 'page' || k === 'pageSize'))) return { ok: false, field: k };
    seen.add(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.has(p))) return { ok: false, field: k };
        f.status = parts;
        break;
      }
      case 'assignee':
        f.assignee = v;
        break;
      case 'team':
        if (v !== 'A' && v !== 'B') return { ok: false, field: k };
        f.team = v;
        break;
      case 'q':
        f.q = v;
        break;
      case 'dueBefore':
        if (!validDate(v)) return { ok: false, field: k };
        f.dueBefore = v;
        break;
      case 'sort':
        if (!SORTS.has(v.replace(/^-/, ''))) return { ok: false, field: k };
        f.sort = v;
        break;
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1 || !Number.isSafeInteger(Number(v))) return { ok: false, field: k };
        f.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) return { ok: false, field: k };
        f.pageSize = Number(v);
        break;
    }
  }
  return { ok: true, filters: f };
}

const idNum = (id) => {
  const n = parseInt(String(id).replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
};

function cmpValue(field, a, b) {
  if (field === 'title') return String(a.title).localeCompare(String(b.title), 'vi');
  const x = a[field];
  const y = b[field];
  return x < y ? -1 : x > y ? 1 : 0;
}

function applyList(tasks, filters) {
  const f = filters;
  const q = normalize(f.q || '');
  let items = tasks.filter((t) => {
    if (f.status && !f.status.includes(t.status)) return false;
    if (f.assignee != null && (f.assignee === 'none' ? t.assignee != null : t.assignee !== f.assignee)) return false;
    if (f.team && t.team !== f.team) return false;
    if (f.dueBefore && !(t.dueDate != null && t.dueDate <= f.dueBefore)) return false;
    if (q && !normalize(t.title).includes(q)) return false;
    return true;
  });
  const desc = f.sort.startsWith('-');
  const field = desc ? f.sort.slice(1) : f.sort;
  const dir = desc ? -1 : 1;
  items = items.slice().sort((a, b) => {
    if (field === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an !== bn) return an ? 1 : -1;
      if (!an) {
        const c = cmpValue(field, a, b);
        if (c) return c * dir;
      }
    } else {
      const c = cmpValue(field, a, b);
      if (c) return c * dir;
    }
    return idNum(a.id) - idNum(b.id);
  });
  const total = items.length;
  if (f.paged) items = items.slice((f.page - 1) * f.pageSize, f.page * f.pageSize);
  return { total, items };
}

module.exports = { parseListQuery, applyList };
