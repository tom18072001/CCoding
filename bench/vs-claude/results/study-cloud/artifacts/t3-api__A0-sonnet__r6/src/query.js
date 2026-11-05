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
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

/** Phân tích tham số; `allowed` là danh sách tên tham số được phép. */
function parseQuery(params, allowed) {
  const seen = new Map();
  for (const [k, v] of params.entries()) {
    if (seen.has(k)) seen.get(k).count++;
    else seen.set(k, { value: v, count: 1 });
  }
  const out = {};
  for (const [k, { value, count }] of seen) {
    if (!allowed.includes(k) || count > 1) throw bad(k);
    switch (k) {
      case 'status': {
        const parts = value.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k);
        out.status = parts;
        break;
      }
      case 'assignee':
        out.assignee = value;
        break;
      case 'team':
        if (!['A', 'B'].includes(value)) throw bad(k);
        out.team = value;
        break;
      case 'q':
        out.q = value;
        break;
      case 'dueBefore':
        if (!validDate(value)) throw bad(k);
        out.dueBefore = value;
        break;
      case 'sort': {
        const name = value.startsWith('-') ? value.slice(1) : value;
        if (!SORTS.includes(name)) throw bad(k);
        out.sort = { field: name, desc: value.startsWith('-') };
        break;
      }
      case 'page':
      case 'pageSize': {
        if (!/^[0-9]{1,15}$/.test(value)) throw bad(k);
        const n = Number(value);
        if (n < 1 || (k === 'pageSize' && n > 100)) throw bad(k);
        out[k] = n;
        break;
      }
      default:
        out[k] = value;
    }
  }
  return out;
}

/** Lọc + sắp xếp (chưa phân trang). `user` là người gọi (member bị giới hạn theo nhóm). */
function selectTasks(store, user, q) {
  const needle = q.q ? fold(q.q) : '';
  let items = store.listTasks().filter((t) => {
    if (user.role === 'member' && t.team !== user.team) return false;
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined && (q.assignee === 'none' ? t.assignee !== null : t.assignee !== q.assignee)) return false;
    if (q.team && t.team !== q.team) return false;
    if (needle && !fold(t.title).includes(needle)) return false;
    if (q.dueBefore && !(t.dueDate && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const { field, desc } = q.sort || { field: 'createdAt', desc: false };
  const dir = desc ? -1 : 1;
  items = items.sort((a, b) => {
    let c = 0;
    if (field === 'dueDate') {
      if (!a.dueDate !== !b.dueDate) return a.dueDate ? -1 : 1;
      if (a.dueDate) c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (field === 'title') c = a.title.localeCompare(b.title, 'vi');
    else c = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
    return c * dir || idNum(a) - idNum(b);
  });
  return items;
}

module.exports = { parseQuery, selectTasks };
