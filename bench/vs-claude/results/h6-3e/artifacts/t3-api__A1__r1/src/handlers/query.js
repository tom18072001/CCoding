'use strict';
const { HttpError } = require('../http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function fold(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

/** Phân tích tham số truy vấn theo thứ tự xuất hiện; lỗi đầu tiên được báo. */
function parseListQuery(searchParams, { paging }) {
  const allowed = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];
  if (paging) allowed.push('page', 'pageSize');
  const out = { sort: 'createdAt', desc: false, page: 1, pageSize: 20 };
  const seen = new Set();
  for (const [k, v] of searchParams) {
    if (!allowed.includes(k) || seen.has(k)) throw bad(k);
    seen.add(k);
    switch (k) {
      case 'status': {
        const list = v.split(',');
        if (!list.every((s) => STATUSES.includes(s))) throw bad(k);
        out.status = list;
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
        out.q = fold(v);
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
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
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1) throw bad(k);
        out.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k);
        out.pageSize = Number(v);
        break;
    }
  }
  return out;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function applyList(tasks, f) {
  let items = tasks.filter((t) => {
    if (f.status && !f.status.includes(t.status)) return false;
    if (f.assignee !== undefined && (f.assignee === 'none' ? t.assignee != null : t.assignee !== f.assignee)) return false;
    if (f.team && t.team !== f.team) return false;
    if (f.q && !fold(t.title).includes(f.q)) return false;
    if (f.dueBefore && (!t.dueDate || t.dueDate > f.dueBefore)) return false;
    return true;
  });
  const dir = f.desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    if (f.sort === 'dueDate') {
      if (a.dueDate == null && b.dueDate == null) c = 0;
      else if (a.dueDate == null) return 1;
      else if (b.dueDate == null) return -1;
      else c = (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) * dir;
    } else if (f.sort === 'title') c = a.title.localeCompare(b.title, 'vi') * dir;
    else if (f.sort === 'priority') c = (a.priority - b.priority) * dir;
    else c = (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) * dir;
    return c || idNum(a) - idNum(b);
  };
  items.sort(cmp);
  return items;
}

module.exports = { parseListQuery, applyList };
