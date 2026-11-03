import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const has = (q, k) => Object.prototype.hasOwnProperty.call(q, k);
const bad = (param) => ({ status: 400, body: { error: `invalid_${param}` } });
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function parseList(raw) {
  if (typeof raw !== 'string') return null;
  const parts = raw.split(',');
  if (parts.some((p) => p === '')) return null;
  return [...new Set(parts)].sort();
}

function decodeCursor(raw) {
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    if (!Number.isInteger(c.id) || typeof c.sig !== 'string') return null;
    if (typeof c.k !== 'string' && typeof c.k !== 'number') return null;
    return c;
  } catch {
    return null;
  }
}

/** Parse + validate query. Fixed check order: status, assignee, sort, limit, cursor. */
function parseQuery(q) {
  let statuses = null;
  let assignees = null;
  if (has(q, 'status')) {
    statuses = parseList(q.status);
    if (!statuses || statuses.some((s) => !STATUSES.includes(s))) return { err: 'status' };
  }
  if (has(q, 'assignee')) {
    assignees = parseList(q.assignee);
    if (!assignees) return { err: 'assignee' };
  }
  let field = 'id';
  let desc = false;
  if (has(q, 'sort')) {
    const raw = q.sort;
    if (typeof raw !== 'string') return { err: 'sort' };
    desc = raw.startsWith('-');
    field = desc ? raw.slice(1) : raw;
    if (!SORT_FIELDS.includes(field)) return { err: 'sort' };
  }
  let limit = null;
  if (has(q, 'limit')) {
    if (typeof q.limit !== 'string' || !/^\d+$/.test(q.limit)) return { err: 'limit' };
    limit = Number(q.limit);
    if (limit < 1 || limit > 100) return { err: 'limit' };
  }
  // normalized signature: value order / duplicates do not matter
  const sig = JSON.stringify([statuses, assignees, desc ? '-' : '', field]);
  let cursor = null;
  if (has(q, 'cursor')) {
    if (limit === null || typeof q.cursor !== 'string') return { err: 'cursor' };
    cursor = decodeCursor(q.cursor);
    if (!cursor || cursor.sig !== sig) return { err: 'cursor' };
    if ((field === 'createdAt') !== (typeof cursor.k === 'string')) return { err: 'cursor' };
  }
  return { statuses, assignees, field, desc, limit, sig, cursor };
}

function listTickets(tickets, q) {
  const p = parseQuery(q || {});
  if (p.err) return bad(p.err);
  let rows = tickets.filter(
    (t) =>
      (!p.statuses || p.statuses.includes(t.status)) &&
      (!p.assignees || p.assignees.includes(t.assignee === null ? 'none' : t.assignee)),
  );
  const dir = p.desc ? -1 : 1;
  rows.sort((a, b) => dir * cmp(a[p.field], b[p.field]) || a.id - b.id);
  if (p.limit === null) return { status: 200, body: rows };
  if (p.cursor) {
    const { k, id } = p.cursor;
    // keyset: strictly after (k, id) in the sort order; id tie-break always ascending
    rows = rows.filter((t) => {
      const c = dir * cmp(t[p.field], k);
      return c > 0 || (c === 0 && t.id > id);
    });
  }
  const items = rows.slice(0, p.limit);
  let nextCursor = null;
  if (rows.length > p.limit) {
    const last = items[items.length - 1];
    nextCursor = Buffer.from(JSON.stringify({ k: last[p.field], id: last.id, sig: p.sig })).toString('base64url');
  }
  return { status: 200, body: { items, nextCursor } };
}

/** Create an in-memory request handler. req = { method, path, query: { [k]: string } } -> { status, body } */
export function createHandler(tickets = seed()) {
  return function handle(req) {
    if (req.method === 'GET' && req.path === '/tickets') {
      return listTickets(tickets, req.query);
    }
    if (req.method === 'GET' && /^\/tickets\/\d+$/.test(req.path)) {
      const t = tickets.find((x) => x.id === Number(req.path.split('/')[2]));
      return t ? { status: 200, body: t } : { status: 404, body: { error: 'not_found' } };
    }
    return { status: 404, body: { error: 'not_found' } };
  };
}
