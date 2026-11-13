'use strict';
const { HttpError } = require('./http');

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

const intIn = (s, min, max) => /^\d{1,15}$/.test(s) && Number(s) >= min && Number(s) <= max;

const RULES = {
  status: (v) => { const a = v.split(','); return a.every((x) => STATUSES.includes(x)) ? a : undefined; },
  assignee: (v) => v,
  team: (v) => (v === 'A' || v === 'B' ? v : undefined),
  q: (v) => v,
  dueBefore: (v) => (validDate(v) ? v : undefined),
  sort: (v) => (SORTS.includes(v.replace(/^-/, '')) ? v : undefined),
  page: (v) => (intIn(v, 1, Number.MAX_SAFE_INTEGER) ? Number(v) : undefined),
  pageSize: (v) => (intIn(v, 1, 100) ? Number(v) : undefined),
  taskId: (v) => v,
};

/** Kiểm tra tham số theo thứ tự xuất hiện trên URL; trả về object giá trị đã parse. */
function parseQuery(params, allowed) {
  const out = {};
  for (const [k, v] of params.entries()) {
    if (!allowed.includes(k) || k in out) throw new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${k}`, { field: k });
    const parsed = RULES[k](v);
    if (parsed === undefined) throw new HttpError(400, 'INVALID_QUERY', `Giá trị không hợp lệ: ${k}`, { field: k });
    out[k] = parsed;
  }
  return out;
}

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

/** Lọc + sắp xếp danh sách nhiệm vụ (chưa phân trang). */
function select(tasks, q, user) {
  let r = tasks;
  if (user.role === 'member') r = r.filter((t) => t.team === user.team);
  if (q.status) r = r.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) r = r.filter((t) => (q.assignee === 'none' ? t.assignee === null || t.assignee === undefined : t.assignee === q.assignee));
  if (q.team) r = r.filter((t) => t.team === q.team);
  if (q.q) { const n = norm(q.q); r = r.filter((t) => norm(t.title).includes(n)); }
  if (q.dueBefore) r = r.filter((t) => t.dueDate && t.dueDate <= q.dueBefore);
  const sort = q.sort || 'createdAt';
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    let c = 0;
    if (field === 'dueDate') {
      const an = !a.dueDate, bn = !b.dueDate;
      if (an || bn) return an && bn ? idNum(a) - idNum(b) : an ? 1 : -1;
      c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    } else if (field === 'title') c = a.title.localeCompare(b.title, 'vi');
    else if (field === 'priority') c = a.priority - b.priority;
    else c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    return c * dir || idNum(a) - idNum(b);
  };
  return [...r].sort(cmp);
}

module.exports = { parseQuery, select, validDate };
