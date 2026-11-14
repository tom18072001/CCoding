'use strict';
const { HttpError } = require('./http');

/** Xác thực qua header X-User → người dùng, hoặc 401. */
function auth(store, req) {
  const id = req.headers['x-user'];
  const user = id ? store.user(id) : undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
  return user;
}

function normalize(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function intIn(s, min, max) {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

/** Kiểm tra tham số truy vấn; báo tham số đầu tiên (theo thứ tự xuất hiện) bị lỗi. */
function parseQuery(params, allowed) {
  const groups = new Map();
  for (const [k, v] of params) {
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(v);
  }
  const bad = (field) => new HttpError(400, 'INVALID_QUERY', `Tham số không hợp lệ: ${field}`, { field });
  const out = { sort: 'createdAt', page: 1, pageSize: 20 };
  for (const [k, vals] of groups) {
    if (!allowed.includes(k) || vals.length > 1) throw bad(k);
    const v = vals[0];
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
      case 'sort': if (!SORTS.includes(v.replace(/^-/, ''))) throw bad(k); out.sort = v; break;
      case 'page': { const n = intIn(v, 1, Infinity); if (n === null) throw bad(k); out.page = n; break; }
      case 'pageSize': { const n = intIn(v, 1, 100); if (n === null) throw bad(k); out.pageSize = n; break; }
    }
  }
  return out;
}

const idNum = (t) => Number(String(t.id).replace(/\D/g, '')) || 0;

function compareBy(sort) {
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const dir = desc ? -1 : 1;
  return (a, b) => {
    let c = 0;
    const x = a[field], y = b[field];
    if (field === 'dueDate') {
      if (x == null || y == null) c = x == null && y == null ? 0 : x == null ? 1 : -1; // null luôn cuối, không đảo chiều
      else c = (x < y ? -1 : x > y ? 1 : 0) * dir;
    } else if (field === 'title') c = x.localeCompare(y, 'vi') * dir;
    else c = (x < y ? -1 : x > y ? 1 : 0) * dir;
    return c || idNum(a) - idNum(b);
  };
}

const COLS = ['id', 'title', 'status', 'priority', 'assignee', 'team', 'dueDate', 'createdAt'];

function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(tasks) {
  const lines = [COLS.join(','), ...tasks.map((t) => COLS.map((c) => cell(t[c])).join(','))];
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

module.exports = { auth, parseQuery, normalize, compareBy, toCsv };
