'use strict';
const { HttpError } = require('./http');

const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const STATUSES = ['todo', 'doing', 'done'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Bỏ dấu tiếng Việt, hạ chữ thường. */
function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

/**
 * Duyệt tham số theo thứ tự xuất hiện trên URL; lỗi đầu tiên được báo.
 * `allowed`: danh sách tên tham số được phép.
 */
function parseQuery(params, allowed) {
  const out = {};
  const seen = new Set();
  for (const [k, v] of params.entries()) {
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
        if (!validDate(v)) throw bad(k);
        out.dueBefore = v;
        break;
      case 'sort': {
        const f = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(f)) throw bad(k);
        out.sort = { field: f, desc: v.startsWith('-') };
        break;
      }
      case 'page':
      case 'pageSize': {
        if (!/^\d+$/.test(v)) throw bad(k);
        const n = Number(v);
        if (n < 1 || (k === 'pageSize' && n > 100)) throw bad(k);
        out[k] = n;
        break;
      }
      case 'taskId':
        out.taskId = v;
        break;
    }
  }
  return out;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

/** Lọc + sắp xếp (chưa phân trang). `user` là người gọi. */
function selectTasks(store, user, q) {
  const needle = q.q ? fold(q.q) : '';
  let items = store.listTasks().filter((t) => {
    if (user.role === 'member' && t.team !== user.team) return false;
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined && (q.assignee === 'none' ? t.assignee !== null && t.assignee !== undefined : t.assignee !== q.assignee)) return false;
    if (q.team && t.team !== q.team) return false;
    if (needle && !fold(t.title).includes(needle)) return false;
    if (q.dueBefore && !(t.dueDate && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const { field, desc } = q.sort || { field: 'createdAt', desc: false };
  const dir = desc ? -1 : 1;
  items = items.sort((a, b) => {
    let c;
    if (field === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) c = an && bn ? 0 : an ? 1 : -1; // null luôn cuối, bất kể chiều
      else c = a.dueDate < b.dueDate ? -dir : a.dueDate > b.dueDate ? dir : 0;
      return c !== 0 ? c : idNum(a) - idNum(b);
    }
    if (field === 'title') c = String(a.title).localeCompare(String(b.title), 'vi') * dir;
    else c = (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * dir;
    return c !== 0 ? c : idNum(a) - idNum(b);
  });
  return items;
}

module.exports = { parseQuery, selectTasks };
