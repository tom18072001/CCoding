'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const FILTER_KEYS = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

function bad(field) {
  return new HttpError(400, 'INVALID_QUERY', `Tham số truy vấn không hợp lệ: ${field}`, { field });
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function fold(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/**
 * Kiểm tra và phân tích tham số truy vấn. `allowed` là danh sách khóa hợp lệ.
 * Báo lỗi tham số đầu tiên theo thứ tự xuất hiện trên URL.
 */
function parseQuery(params, allowed) {
  const counts = new Map();
  for (const [k] of params) counts.set(k, (counts.get(k) || 0) + 1);
  const out = {};
  for (const [k, v] of params) {
    if (!allowed.includes(k) || counts.get(k) > 1) throw bad(k);
    switch (k) {
      case 'status': {
        const vals = v.split(',');
        if (!vals.every((x) => STATUSES.includes(x))) throw bad(k);
        out.status = vals;
        break;
      }
      case 'team':
        if (!['A', 'B'].includes(v)) throw bad(k);
        out.team = v;
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        out.dueBefore = v;
        break;
      case 'sort':
        if (!SORTS.includes(v.replace(/^-/, ''))) throw bad(k);
        out.sort = v;
        break;
      case 'page':
        if (!/^\d+$/.test(v) || Number(v) < 1) throw bad(k);
        out.page = Number(v);
        break;
      case 'pageSize':
        if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100) throw bad(k);
        out.pageSize = Number(v);
        break;
      default:
        out[k] = v; // assignee, q, taskId
    }
  }
  return out;
}

const idNum = (t) => parseInt(String(t.id).replace(/\D/g, ''), 10) || 0;

/** Lọc + sắp xếp (chưa phân trang). `user` là người gọi (member bị ép theo nhóm). */
function selectTasks(store, q, user) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (q.status) items = items.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee === null : t.assignee === q.assignee));
  if (q.team) items = items.filter((t) => t.team === q.team);
  if (q.q) {
    const needle = fold(q.q);
    items = items.filter((t) => fold(t.title).includes(needle));
  }
  if (q.dueBefore) items = items.filter((t) => t.dueDate && t.dueDate <= q.dueBefore);

  const sort = q.sort || 'createdAt';
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const dir = desc ? -1 : 1;
  items.sort((a, b) => {
    let c = 0;
    if (field === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) {
        if (an && bn) return idNum(a) - idNum(b);
        return an ? 1 : -1; // không có dueDate luôn ở cuối
      }
      c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (field === 'title') {
      c = a.title.localeCompare(b.title, 'vi');
    } else if (field === 'priority') {
      c = a.priority - b.priority;
    } else {
      c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    }
    return c !== 0 ? c * dir : idNum(a) - idNum(b);
  });
  return items;
}

module.exports = { parseQuery, selectTasks, FILTER_KEYS };
