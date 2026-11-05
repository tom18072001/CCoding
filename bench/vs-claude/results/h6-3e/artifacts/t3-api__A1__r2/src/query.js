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
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function fold(s) {
  return String(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

/**
 * Phân tích tham số truy vấn theo thứ tự xuất hiện trên URL.
 * allowed: tập tên tham số được phép. Trả về đối tượng đã chuẩn hóa.
 */
function parseQuery(params, allowed) {
  const out = {};
  const seen = new Set();
  for (const [k, v] of params) {
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
        if (v !== 'A' && v !== 'B') throw bad(k);
        out.team = v;
        break;
      case 'q':
        if (v !== '') out.q = fold(v);
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k);
        out.dueBefore = v;
        break;
      case 'sort': {
        const name = v.startsWith('-') ? v.slice(1) : v;
        if (!SORTS.includes(name)) throw bad(k);
        out.sort = { field: name, desc: v.startsWith('-') };
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
      default:
        out[k] = v;
    }
  }
  return out;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

/** Lọc + sắp xếp (không phân trang). `viewer` dùng để giới hạn nhóm của member. */
function selectTasks(tasks, q, viewer) {
  const sort = q.sort || { field: 'createdAt', desc: false };
  let items = tasks.filter((t) => {
    if (viewer.role === 'member' && t.team !== viewer.team) return false;
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined && (q.assignee === 'none' ? t.assignee != null : t.assignee !== q.assignee)) return false;
    if (q.team && t.team !== q.team) return false;
    if (q.q && !fold(t.title).includes(q.q)) return false;
    if (q.dueBefore && !(t.dueDate != null && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const dir = sort.desc ? -1 : 1;
  items = items.sort((a, b) => {
    let c = 0;
    const f = sort.field;
    if (f === 'dueDate') {
      const an = a.dueDate == null;
      const bn = b.dueDate == null;
      if (an || bn) c = an && bn ? 0 : an ? 1 : -1; // null luôn cuối, không đảo chiều
      else c = a.dueDate < b.dueDate ? -dir : a.dueDate > b.dueDate ? dir : 0;
    } else if (f === 'title') c = dir * a.title.localeCompare(b.title, 'vi');
    else c = a[f] < b[f] ? -dir : a[f] > b[f] ? dir : 0;
    return c || idNum(a) - idNum(b);
  });
  return items;
}

module.exports = { parseQuery, selectTasks };
