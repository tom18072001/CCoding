'use strict';

const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];
const BASE = ['status', 'assignee', 'team', 'q', 'dueBefore', 'sort'];

function normalize(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dim = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function parseInt10(s, min, max) {
  if (!/^[0-9]+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < min || n > max) return null;
  return n;
}

function parseQuery(searchParams, { allowPaging = true } = {}) {
  const allowed = allowPaging ? BASE.concat(['page', 'pageSize']) : BASE;
  const seen = new Set();
  const query = { sort: 'createdAt', desc: false };
  if (allowPaging) { query.page = 1; query.pageSize = 20; query.paging = true; }
  for (const key of searchParams.keys()) {
    if (!allowed.includes(key) || seen.has(key)) return { ok: false, field: key };
    seen.add(key);
    const v = searchParams.get(key);
    switch (key) {
      case 'status': {
        const list = v.split(',');
        if (!list.every((x) => STATUSES.includes(x))) return { ok: false, field: key };
        query.status = list;
        break;
      }
      case 'assignee': query.assignee = v; break;
      case 'team':
        if (v !== 'A' && v !== 'B') return { ok: false, field: key };
        query.team = v;
        break;
      case 'q': if (v !== '') query.q = normalize(v); break;
      case 'dueBefore':
        if (!validDate(v)) return { ok: false, field: key };
        query.dueBefore = v;
        break;
      case 'sort': {
        const desc = v.startsWith('-');
        const f = desc ? v.slice(1) : v;
        if (!SORTS.includes(f)) return { ok: false, field: key };
        query.sort = f; query.desc = desc;
        break;
      }
      case 'page': {
        const n = parseInt10(v, 1, Number.MAX_SAFE_INTEGER);
        if (n === null) return { ok: false, field: key };
        query.page = n;
        break;
      }
      case 'pageSize': {
        const n = parseInt10(v, 1, 100);
        if (n === null) return { ok: false, field: key };
        query.pageSize = n;
        break;
      }
    }
  }
  return { ok: true, query };
}

function idNum(t) {
  const m = /(\d+)/.exec(String(t.id));
  return m ? Number(m[1]) : 0;
}

function cmpVal(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function applyQuery(tasks, query) {
  const q = query || {};
  let list = tasks.filter((t) => {
    if (q.status && !q.status.includes(t.status)) return false;
    if (q.assignee !== undefined) {
      if (q.assignee === 'none') { if (t.assignee != null) return false; }
      else if (t.assignee !== q.assignee) return false;
    }
    if (q.team && t.team !== q.team) return false;
    if (q.q && !normalize(t.title == null ? '' : t.title).includes(q.q)) return false;
    if (q.dueBefore && !(t.dueDate && t.dueDate <= q.dueBefore)) return false;
    return true;
  });
  const sort = q.sort || 'createdAt';
  const dir = q.desc ? -1 : 1;
  const hasDue = (t) => t.dueDate != null && t.dueDate !== '';
  list = list.slice().sort((a, b) => {
    let c = 0;
    if (sort === 'dueDate') {
      const ha = hasDue(a), hb = hasDue(b);
      if (ha !== hb) return ha ? -1 : 1;
      if (ha) c = cmpVal(a.dueDate, b.dueDate) * dir;
    } else if (sort === 'title') {
      c = String(a.title).localeCompare(String(b.title), 'vi') * dir;
    } else {
      c = cmpVal(a[sort], b[sort]) * dir;
    }
    return c || idNum(a) - idNum(b);
  });
  const total = list.length;
  if (!q.paging) return { items: list, total, page: 1, pageSize: total };
  const page = q.page || 1;
  const pageSize = q.pageSize || 20;
  return { items: list.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize };
}

module.exports = { parseQuery, applyQuery, normalize };
