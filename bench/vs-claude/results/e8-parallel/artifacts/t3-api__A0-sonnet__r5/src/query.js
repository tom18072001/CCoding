'use strict';
const { HttpError } = require('./http');

const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });

/** Kiểm tra tham số theo thứ tự xuất hiện đầu tiên trên URL. validators: { tên: (giá trị) => giá trị parse, ném lỗi nếu sai }. */
function parseQuery(params, validators) {
  const out = {};
  const seen = new Set();
  for (const [k] of params.entries()) {
    if (seen.has(k)) continue;
    seen.add(k);
    if (!Object.hasOwn(validators, k)) throw bad(k);
    const all = params.getAll(k);
    if (all.length > 1) throw bad(k);
    try {
      out[k] = validators[k](all[0]);
    } catch {
      throw bad(k);
    }
  }
  return out;
}

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function validDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) throw new Error('date');
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw new Error('date');
  return v;
}

function intIn(min, max) {
  return (v) => {
    if (!/^[0-9]+$/.test(v)) throw new Error('int');
    const n = Number(v);
    if (n < min || n > max) throw new Error('range');
    return n;
  };
}

function parseListQuery(params, { paging }) {
  const validators = {
    status: (v) => {
      const list = v.split(',');
      if (!list.every((s) => STATUSES.includes(s))) throw new Error('status');
      return list;
    },
    assignee: (v) => v,
    team: (v) => {
      if (!['A', 'B'].includes(v)) throw new Error('team');
      return v;
    },
    q: (v) => v,
    dueBefore: validDate,
    sort: (v) => {
      const f = v.startsWith('-') ? v.slice(1) : v;
      if (!SORTS.includes(f)) throw new Error('sort');
      return v;
    },
  };
  if (paging) {
    validators.page = intIn(1, Number.MAX_SAFE_INTEGER);
    validators.pageSize = intIn(1, 100);
  }
  const q = parseQuery(params, validators);
  q.page ??= 1;
  q.pageSize ??= 20;
  return q;
}

const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function listTasks(store, user, q) {
  let items = store.listTasks();
  if (user.role === 'member') items = items.filter((t) => t.team === user.team);
  if (q.status) items = items.filter((t) => q.status.includes(t.status));
  if (q.assignee !== undefined) items = items.filter((t) => (q.assignee === 'none' ? t.assignee === null : t.assignee === q.assignee));
  if (q.team) items = items.filter((t) => t.team === q.team);
  if (q.q) {
    const needle = fold(q.q);
    items = items.filter((t) => fold(t.title).includes(needle));
  }
  if (q.dueBefore) items = items.filter((t) => t.dueDate != null && t.dueDate <= q.dueBefore);

  const sort = q.sort ?? 'createdAt';
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    const x = a[field];
    const y = b[field];
    if (field === 'dueDate' && (x == null || y == null)) {
      if (x == null && y == null) return idNum(a) - idNum(b);
      return x == null ? 1 : -1;
    }
    const c = field === 'title' ? x.localeCompare(y, 'vi') : x < y ? -1 : x > y ? 1 : 0;
    return c !== 0 ? c * dir : idNum(a) - idNum(b);
  };
  return items.sort(cmp);
}

module.exports = { parseQuery, parseListQuery, listTasks };
