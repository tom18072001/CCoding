'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function fold(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

/** Phân tích tham số danh sách. paginate=false → page/pageSize là tham số lạ. */
function parseListQuery(searchParams, { paginate }) {
  const seen = new Set();
  const out = { status: null, assignee: undefined, team: undefined, q: '', dueBefore: undefined, sort: 'createdAt', page: 1, pageSize: 20 };
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', ...(paginate ? ['page', 'pageSize'] : [])];
  for (const [k, v] of searchParams) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k);
        out.status = parts;
        break;
      }
      case 'assignee': out.assignee = v; break;
      case 'team': if (!['A', 'B'].includes(v)) throw bad(k); out.team = v; break;
      case 'q': out.q = v; break;
      case 'dueBefore': if (!validDate(v)) throw bad(k); out.dueBefore = v; break;
      case 'sort': {
        const f = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw bad(k);
        out.sort = v;
        break;
      }
      case 'page': if (!/^[1-9]\d{0,14}$/.test(v)) throw bad(k); out.page = Number(v); break;
      case 'pageSize': {
        if (!/^[1-9]\d{0,2}$/.test(v) || Number(v) > 100) throw bad(k);
        out.pageSize = Number(v);
        break;
      }
    }
  }
  return out;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

/** Lọc + sắp xếp (chưa phân trang). `user` quyết định phạm vi nhìn thấy. */
function selectTasks(tasks, q, user) {
  const needle = fold(q.q);
  let items = tasks.filter((t) => {
    if (user.role === 'member' && t.team !== user.team) return false;
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined && (q.assignee === 'none' ? t.assignee !== null && t.assignee !== undefined : t.assignee !== q.assignee)) return false;
    if (q.team && t.team !== q.team) return false;
    if (needle && !fold(t.title).includes(needle)) return false;
    if (q.dueBefore !== undefined && !(t.dueDate && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const desc = q.sort.startsWith('-');
  const f = desc ? q.sort.slice(1) : q.sort;
  const dir = desc ? -1 : 1;
  const base = (a, b) => {
    if (f === 'title') return a.title.localeCompare(b.title, 'vi');
    if (a[f] < b[f]) return -1;
    return a[f] > b[f] ? 1 : 0;
  };
  items = items.sort((a, b) => {
    if (f === 'dueDate') {
      const an = !a.dueDate, bn = !b.dueDate;
      if (an || bn) {
        if (an && bn) return idNum(a) - idNum(b);
        return an ? 1 : -1;
      }
    }
    return base(a, b) * dir || idNum(a) - idNum(b);
  });
  return items;
}

module.exports = { parseListQuery, selectTasks };
