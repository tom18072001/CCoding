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
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

/** Duyệt tham số theo thứ tự xuất hiện trên URL; lỗi đầu tiên được báo. */
function parseListQuery(params, { paginate }) {
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', ...(paginate ? ['page', 'pageSize'] : [])];
  const q = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  const seen = new Set();
  for (const [k, v] of params.entries()) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const list = v.split(',');
        if (!list.every((x) => STATUSES.includes(x))) throw bad(k);
        q.status = list;
        break;
      }
      case 'assignee':
        q.assignee = v;
        break;
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        q.team = v;
        break;
      case 'q':
        q.q = norm(v);
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        q.dueBefore = v;
        break;
      case 'sort': {
        const name = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(name)) throw bad(k);
        q.sort = name;
        q.desc = v.startsWith('-');
        break;
      }
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1 || !Number.isSafeInteger(Number(v))) throw bad(k);
        q.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k);
        q.pageSize = Number(v);
        break;
    }
  }
  return q;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, ''));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function applyQuery(tasks, q, user) {
  const items = tasks.filter((t) => {
    if (user.role === 'member' && t.team !== user.team) return false;
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined && (q.assignee === 'none' ? t.assignee !== null : t.assignee !== q.assignee)) return false;
    if (q.team && t.team !== q.team) return false;
    if (q.q && !norm(t.title).includes(q.q)) return false;
    if (q.dueBefore && !(t.dueDate !== null && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const dir = q.desc ? -1 : 1;
  return items.sort((a, b) => {
    let c = 0;
    if (q.sort === 'dueDate') {
      if (a.dueDate === null && b.dueDate !== null) return 1;
      if (b.dueDate === null && a.dueDate !== null) return -1;
      if (a.dueDate !== null) c = dir * cmp(a.dueDate, b.dueDate);
    } else if (q.sort === 'title') c = dir * a.title.localeCompare(b.title, 'vi');
    else c = dir * cmp(a[q.sort], b[q.sort]);
    return c || idNum(a) - idNum(b);
  });
}

module.exports = { parseListQuery, applyQuery };
