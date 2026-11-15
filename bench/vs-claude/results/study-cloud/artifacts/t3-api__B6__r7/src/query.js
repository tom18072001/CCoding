'use strict';
const { HttpError } = require('./http');

const KEYS = new Set(['status', 'assignee', 'team', 'q', 'dueBefore', 'sort', 'page', 'pageSize']);
const STATUSES = ['todo', 'doing', 'done'];
const SORTS = ['createdAt', 'dueDate', 'priority', 'title'];

function bad(field, msg) {
  return new HttpError(400, 'INVALID_QUERY', msg, { field });
}

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(2000, mo - 1, d));
  dt.setUTCFullYear(y);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parseListQuery(searchParams, { paging = true } = {}) {
  const counts = new Map(); // theo thứ tự xuất hiện đầu tiên trên URL
  for (const [k] of searchParams) counts.set(k, (counts.get(k) || 0) + 1);
  const out = {
    filter: { status: null, assignee: null, team: null, q: '', dueBefore: null },
    sort: { field: 'createdAt', desc: false },
    page: 1,
    pageSize: 20,
  };
  for (const [k, n] of counts) {
    if (!KEYS.has(k) || (!paging && (k === 'page' || k === 'pageSize'))) throw bad(k, `Tham số không hợp lệ: ${k}`);
    if (n > 1) throw bad(k, `Tham số lặp: ${k}`);
    const v = searchParams.get(k);
    switch (k) {
      case 'status': {
        const parts = v.split(',');
        if (!parts.every((p) => STATUSES.includes(p))) throw bad(k, 'status không hợp lệ');
        out.filter.status = parts;
        break;
      }
      case 'assignee':
        out.filter.assignee = v === '' ? null : v;
        break;
      case 'team':
        if (v !== 'A' && v !== 'B') throw bad(k, 'team phải là A hoặc B');
        out.filter.team = v;
        break;
      case 'q':
        out.filter.q = v;
        break;
      case 'dueBefore':
        if (!validDate(v)) throw bad(k, 'dueBefore phải là ngày YYYY-MM-DD hợp lệ');
        out.filter.dueBefore = v;
        break;
      case 'sort': {
        const desc = v.startsWith('-');
        const field = desc ? v.slice(1) : v;
        if (!SORTS.includes(field)) throw bad(k, 'sort không hợp lệ');
        out.sort = { field, desc };
        break;
      }
      case 'page':
      case 'pageSize': {
        if (!/^[0-9]+$/.test(v)) throw bad(k, `${k} phải là số nguyên`);
        const num = Number(v);
        const max = k === 'page' ? Number.MAX_SAFE_INTEGER : 100;
        if (!Number.isSafeInteger(num) || num < 1 || num > max) throw bad(k, `${k} ngoài miền cho phép`);
        out[k] = num;
        break;
      }
    }
  }
  return out;
}

function normalize(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

function idNum(id) {
  const m = /(\d+)\s*$/.exec(String(id));
  return m ? Number(m[1]) : 0;
}

function applyQuery(tasks, parsed) {
  const { filter, sort } = parsed;
  const q = normalize(filter.q || '');
  const list = tasks.filter((t) => {
    if (filter.status && !filter.status.includes(t.status)) return false;
    if (filter.assignee !== null && filter.assignee !== undefined) {
      if (filter.assignee === 'none') {
        if (t.assignee != null) return false;
      } else if (t.assignee !== filter.assignee) return false;
    }
    if (filter.team && t.team !== filter.team) return false;
    if (q && !normalize(t.title || '').includes(q)) return false;
    if (filter.dueBefore && !(t.dueDate != null && t.dueDate <= filter.dueBefore)) return false;
    return true;
  });
  const dir = sort.desc ? -1 : 1;
  const cmp = (a, b) => {
    const x = a[sort.field];
    const y = b[sort.field];
    let r;
    if (sort.field === 'dueDate') {
      if (x == null && y == null) r = 0;
      else if (x == null) return 1;
      else if (y == null) return -1;
      else r = (x < y ? -1 : x > y ? 1 : 0) * dir;
    } else if (sort.field === 'title') {
      r = String(x).localeCompare(String(y), 'vi') * dir;
    } else {
      r = (x < y ? -1 : x > y ? 1 : 0) * dir;
    }
    return r || idNum(a.id) - idNum(b.id);
  };
  return list.sort(cmp);
}

function paginate(arr, page, pageSize) {
  return arr.slice((page - 1) * pageSize, page * pageSize);
}

module.exports = { parseListQuery, applyQuery, paginate };
