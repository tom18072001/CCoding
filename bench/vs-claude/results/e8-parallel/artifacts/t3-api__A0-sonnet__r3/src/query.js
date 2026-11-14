'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(2000, mo - 1, d));
  dt.setUTCFullYear(y);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function strictInt(s) {
  return /^\d+$/.test(s) ? Number(s) : NaN;
}

/** Duyệt theo thứ tự xuất hiện trên URL; lỗi đầu tiên được báo. */
function parseListQuery(searchParams, { paging }) {
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', ...(paging ? ['page', 'pageSize'] : [])];
  const seen = new Set();
  const out = { page: 1, pageSize: 20, sort: 'createdAt', desc: false };
  for (const [k, v] of searchParams.entries()) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k);
        out.status = parts;
        break;
      }
      case 'assignee':
        out.assignee = v;
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        out.team = v;
        break;
      case 'q':
        out.q = v;
        break;
      case 'dueBefore':
        if (!isRealDate(v)) throw bad(k);
        out.dueBefore = v;
        break;
      case 'sort': {
        const desc = v.startsWith('-');
        const f = desc ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw bad(k);
        out.sort = f;
        out.desc = desc;
        break;
      }
      case 'page': {
        const n = strictInt(v);
        if (!Number.isSafeInteger(n) || n < 1) throw bad(k);
        out.page = n;
        break;
      }
      case 'pageSize': {
        const n = strictInt(v);
        if (!Number.isSafeInteger(n) || n < 1 || n > 100) throw bad(k);
        out.pageSize = n;
        break;
      }
    }
  }
  return out;
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

/** Lọc + sắp xếp (chưa phân trang). `user` là người gọi. */
function selectTasks(store, q, user) {
  const needle = q.q ? fold(q.q) : '';
  const items = store.listTasks().filter((t) => {
    if (user.role === 'member' && t.team !== user.team) return false;
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined && (q.assignee === 'none' ? t.assignee != null : t.assignee !== q.assignee)) return false;
    if (q.team && t.team !== q.team) return false;
    if (needle && !fold(t.title).includes(needle)) return false;
    if (q.dueBefore && !(t.dueDate != null && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const dir = q.desc ? -1 : 1;
  const cmp = (a, b) => {
    let c;
    if (q.sort === 'dueDate') {
      const na = a.dueDate == null;
      const nb = b.dueDate == null;
      if (na || nb) {
        if (na && nb) c = 0;
        else return na ? 1 : -1;
      } else c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (q.sort === 'title') c = a.title.localeCompare(b.title, 'vi');
    else if (q.sort === 'priority') c = a.priority - b.priority;
    else c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    return c * dir || idNum(a) - idNum(b);
  };
  return items.sort(cmp);
}

module.exports = { parseListQuery, selectTasks };
