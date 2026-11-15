'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const TEAMS = ['A', 'B'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', { field });
}

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function intIn(s, min, max) {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

function idNum(id) {
  return Number(String(id).replace(/\D/g, '')) || 0;
}

/** Phân tích tham số theo thứ tự xuất hiện; lỗi đầu tiên được ném. */
function parseParams(searchParams, paginate) {
  const allowed = new Set(['status', 'assignee', 'team', 'q', 'dueBefore', 'sort']);
  if (paginate) { allowed.add('page'); allowed.add('pageSize'); }
  const seen = new Set();
  const o = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  for (const [k, v] of searchParams.entries()) {
    if (!allowed.has(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const list = v.split(',');
        if (!list.every((x) => STATUSES.includes(x))) throw bad(k);
        o.status = list;
        break;
      }
      case 'assignee': o.assignee = v; break;
      case 'team': if (!TEAMS.includes(v)) throw bad(k); o.team = v; break;
      case 'q': o.q = fold(v); break;
      case 'dueBefore': if (!validDate(v)) throw bad(k); o.dueBefore = v; break;
      case 'sort': {
        const desc = v.startsWith('-');
        const f = desc ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw bad(k);
        o.sort = f; o.desc = desc;
        break;
      }
      case 'page': { const n = intIn(v, 1, Infinity); if (n === null) throw bad(k); o.page = n; break; }
      case 'pageSize': { const n = intIn(v, 1, 100); if (n === null) throw bad(k); o.pageSize = n; break; }
    }
  }
  return o;
}

/**
 * Lọc/tìm/sắp xếp/phân trang. Trả { items, total, page, pageSize } khi paginate (mặc định),
 * hoặc { items, total } khi paginate=false.
 */
function queryTasks(tasks, searchParams, { paginate = true, viewer } = {}) {
  const p = parseParams(searchParams, paginate);
  let list = tasks.filter((t) => {
    if (viewer && viewer.role === 'member' && t.team !== viewer.team) return false;
    if (p.status && !p.status.includes(t.status)) return false;
    if (p.assignee !== undefined && (p.assignee === 'none' ? t.assignee != null : t.assignee !== p.assignee)) return false;
    if (p.team && t.team !== p.team) return false;
    if (p.q && !fold(t.title ?? '').includes(p.q)) return false;
    if (p.dueBefore && !(t.dueDate != null && t.dueDate <= p.dueBefore)) return false;
    return true;
  });
  const dir = p.desc ? -1 : 1;
  list = list.slice().sort((a, b) => {
    let c = 0;
    if (p.sort === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) {
        if (an && bn) return idNum(a.id) - idNum(b.id);
        return an ? 1 : -1;
      }
      c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (p.sort === 'title') {
      c = String(a.title).localeCompare(String(b.title), 'vi');
    } else {
      const x = a[p.sort];
      const y = b[p.sort];
      c = x < y ? -1 : x > y ? 1 : 0;
    }
    return c * dir || idNum(a.id) - idNum(b.id);
  });
  const total = list.length;
  if (!paginate) return { items: list, total };
  const start = (p.page - 1) * p.pageSize;
  return { items: list.slice(start, start + p.pageSize), total, page: p.page, pageSize: p.pageSize };
}

module.exports = { queryTasks };
