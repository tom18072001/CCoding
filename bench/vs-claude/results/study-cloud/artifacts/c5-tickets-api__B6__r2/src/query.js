import { STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const bad = (p) => ({ error: { status: 400, body: { error: `invalid_${p}` } } });
const has = (q, k) => Object.prototype.hasOwnProperty.call(q, k) && q[k] !== undefined;
const norm = (list) => [...new Set(list)].sort();

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
  try {
    const p = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (!p || typeof p !== 'object' || typeof p.s !== 'string' || !Number.isInteger(p.id)) return null;
    if (typeof p.k !== 'number' && typeof p.k !== 'string') return null;
    return p;
  } catch {
    return null;
  }
}

/** Parse + validate query. Returns { params } or { error: {status, body} }. */
export function parseQuery(query) {
  const q = query ?? {};
  let statuses = null;
  if (has(q, 'status')) {
    statuses = String(q.status).split(',');
    if (!statuses.every((s) => STATUSES.includes(s))) return bad('status');
    statuses = norm(statuses);
  }
  let assignees = null;
  if (has(q, 'assignee')) {
    assignees = String(q.assignee).split(',');
    if (assignees.some((a) => a === '')) return bad('assignee');
    assignees = norm(assignees);
  }
  let sort = 'id';
  if (has(q, 'sort')) {
    sort = String(q.sort);
    if (!SORT_FIELDS.includes(sort.replace(/^-/, ''))) return bad('sort');
  }
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;

  let limit = null;
  if (has(q, 'limit')) {
    const raw = String(q.limit);
    if (!/^\d+$/.test(raw)) return bad('limit');
    limit = Number(raw);
    if (limit < 1 || limit > 100) return bad('limit');
  }

  const sig = JSON.stringify([statuses, assignees, sort]);
  let after = null;
  if (has(q, 'cursor')) {
    if (limit === null) return bad('cursor');
    const c = decodeCursor(q.cursor);
    if (!c || c.s !== sig) return bad('cursor');
    if (typeof c.k !== (field === 'createdAt' ? 'string' : 'number')) return bad('cursor');
    after = c;
  }
  return { params: { statuses, assignees, field, desc, limit, sig, after } };
}

export function runQuery(tickets, p) {
  let list = tickets.filter(
    (t) =>
      (!p.statuses || p.statuses.includes(t.status)) &&
      (!p.assignees || p.assignees.some((a) => (a === 'none' ? t.assignee === null : t.assignee === a))),
  );
  const dir = p.desc ? -1 : 1;
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  list.sort((a, b) => dir * cmp(a[p.field], b[p.field]) || a.id - b.id);
  if (p.limit === null) return list;

  if (p.after) {
    const { k, id } = p.after;
    list = list.filter((t) => {
      const c = dir * cmp(t[p.field], k);
      return c > 0 || (c === 0 && t.id > id);
    });
  }
  const items = list.slice(0, p.limit);
  const last = items[items.length - 1];
  const nextCursor =
    list.length > p.limit ? encodeCursor({ k: last[p.field], id: last.id, s: p.sig }) : null;
  return { items, nextCursor };
}
