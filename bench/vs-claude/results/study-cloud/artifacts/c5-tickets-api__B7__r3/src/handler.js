import { seed, STATUSES } from './data.js';

/** Create an in-memory request handler. req = { method, path, query: { [k]: string } } -> { status, body } */
export function createHandler(tickets = seed()) {
  return function handle(req) {
    if (req.method === 'GET' && req.path === '/tickets') {
      return listTickets(tickets, req.query || {});
    }
    if (req.method === 'GET' && /^\/tickets\/\d+$/.test(req.path)) {
      const t = tickets.find((x) => x.id === Number(req.path.split('/')[2]));
      return t ? { status: 200, body: t } : { status: 404, body: { error: 'not_found' } };
    }
    return { status: 404, body: { error: 'not_found' } };
  };
}

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const bad = (p) => ({ status: 400, body: { error: `invalid_${p}` } });
const has = (q, k) => Object.prototype.hasOwnProperty.call(q, k) && q[k] !== undefined;

function parseList(v) {
  if (typeof v !== 'string') return null;
  const parts = v.split(',');
  return parts.some((p) => p === '') ? null : parts;
}

// Cursor = base64url(JSON { f: filter fingerprint, v: last sort value, i: last id }) -> keyset pagination.
function encodeCursor(fp, last, field) {
  return Buffer.from(JSON.stringify({ f: fp, v: last[field], i: last.id })).toString('base64url');
}

function decodeCursor(c, fp, field) {
  try {
    if (typeof c !== 'string' || !/^[A-Za-z0-9_-]+$/.test(c)) return null;
    const o = JSON.parse(Buffer.from(c, 'base64url').toString('utf8'));
    if (!o || o.f !== fp || !Number.isInteger(o.i)) return null;
    if (typeof o.v !== (field === 'createdAt' ? 'string' : 'number')) return null;
    return o;
  } catch {
    return null;
  }
}

function listTickets(tickets, q) {
  let list = [...tickets];
  if (has(q, 'status')) {
    const vals = parseList(q.status);
    if (!vals || vals.some((v) => !STATUSES.includes(v))) return bad('status');
    list = list.filter((t) => vals.includes(t.status));
  }
  if (has(q, 'assignee')) {
    const vals = parseList(q.assignee);
    if (!vals) return bad('assignee');
    list = list.filter((t) => vals.includes(t.assignee === null ? 'none' : t.assignee));
  }
  let field = 'id';
  let dir = 1;
  if (has(q, 'sort')) {
    if (typeof q.sort !== 'string') return bad('sort');
    const desc = q.sort.startsWith('-');
    field = desc ? q.sort.slice(1) : q.sort;
    if (!SORT_FIELDS.includes(field)) return bad('sort');
    dir = desc ? -1 : 1;
  }
  let limit = null;
  if (has(q, 'limit')) {
    if (typeof q.limit !== 'string' || !/^\d{1,9}$/.test(q.limit)) return bad('limit');
    limit = Number(q.limit);
    if (limit < 1 || limit > 100) return bad('limit');
  }
  const fp = JSON.stringify([q.status ?? null, q.assignee ?? null, q.sort ?? null]);
  let cur = null;
  if (has(q, 'cursor')) {
    if (limit === null) return bad('cursor');
    cur = decodeCursor(q.cursor, fp, field);
    if (!cur) return bad('cursor');
  }
  const cmp = (a, b) => {
    const x = a[field];
    const y = b[field];
    return (x < y ? -dir : x > y ? dir : 0) || a.id - b.id;
  };
  list.sort(cmp);
  if (limit === null) return { status: 200, body: list };
  if (cur) list = list.filter((t) => cmp(t, { [field]: cur.v, id: cur.i }) > 0);
  const items = list.slice(0, limit);
  const nextCursor = list.length > limit ? encodeCursor(fp, items[items.length - 1], field) : null;
  return { status: 200, body: { items, nextCursor } };
}
