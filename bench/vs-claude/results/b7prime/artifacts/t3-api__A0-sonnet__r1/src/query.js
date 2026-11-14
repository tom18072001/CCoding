'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const FILTER_PARAMS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số truy vấn không hợp lệ: ${field}`, { field });

/** Gom tham số theo thứ tự xuất hiện đầu tiên; trả về Map tên → mảng giá trị. */
function collect(sp, allowed) {
  const m = new Map();
  for (const [k, v] of sp.entries()) {
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(v);
  }
  for (const [k, vals] of m) if (!allowed.includes(k) || vals.length > 1) throw bad(k);
  return m;
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCFullYear(y);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function fold(s) {
  return String(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
}

function parseInt10(s, min, max) {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

function parseListQuery(sp, { paged }) {
  const allowed = paged ? [...FILTER_PARAMS, 'page', 'pageSize'] : FILTER_PARAMS;
  const m = collect(sp, allowed);
  const q = { page: 1, pageSize: 20, sort: 'createdAt', desc: false };
  for (const [k, [v]] of m) {
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k);
        q.status = parts;
        break;
      }
      case 'assignee': q.assignee = v; break;
      case 'team': if (!['A', 'B'].includes(v)) throw bad(k); q.team = v; break;
      case 'q': q.q = fold(v); break;
      case 'dueBefore': if (!validDate(v)) throw bad(k); q.dueBefore = v; break;
      case 'sort': {
        const desc = v.startsWith('-');
        const f = desc ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw bad(k);
        q.sort = f;
        q.desc = desc;
        break;
      }
      case 'page': {
        const n = parseInt10(v, 1, Infinity);
        if (n === null) throw bad(k);
        q.page = n;
        break;
      }
      case 'pageSize': {
        const n = parseInt10(v, 1, 100);
        if (n === null) throw bad(k);
        q.pageSize = n;
        break;
      }
    }
  }
  return q;
}

function parseAuditQuery(sp) {
  const m = collect(sp, ['taskId']);
  return { taskId: m.has('taskId') ? m.get('taskId')[0] : undefined };
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function filterAndSort(list, q) {
  let items = list.filter((t) => {
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined && (q.assignee === 'none' ? t.assignee !== null : t.assignee !== q.assignee)) return false;
    if (q.team && t.team !== q.team) return false;
    if (q.q && !fold(t.title).includes(q.q)) return false;
    if (q.dueBefore && !(t.dueDate && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const dir = q.desc ? -1 : 1;
  items = items.sort((a, b) => {
    let c = 0;
    if (q.sort === 'dueDate') {
      if (!a.dueDate !== !b.dueDate) return a.dueDate ? -1 : 1;
      c = a.dueDate && b.dueDate ? (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) : 0;
    } else if (q.sort === 'title') c = a.title.localeCompare(b.title, 'vi');
    else c = a[q.sort] < b[q.sort] ? -1 : a[q.sort] > b[q.sort] ? 1 : 0;
    return c * dir || idNum(a) - idNum(b);
  });
  return items;
}

module.exports = { parseListQuery, parseAuditQuery, filterAndSort, fold };
