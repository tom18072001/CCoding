import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const bad = (param) => ({ status: 400, body: { error: `invalid_${param}` } });
const has = (q, k) => Object.prototype.hasOwnProperty.call(q, k) && q[k] !== undefined;

function encodeCursor(fp, v, id) {
  return Buffer.from(JSON.stringify([fp, v, id])).toString('base64url');
}

/** Returns [fp, v, id] or null when malformed. */
function decodeCursor(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
  try {
    const c = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (!Array.isArray(c) || c.length !== 3) return null;
    if (typeof c[0] !== 'string' || !Number.isInteger(c[2])) return null;
    return c;
  } catch {
    return null;
  }
}

function listTickets(tickets, q) {
  let statuses = null;
  if (has(q, 'status')) {
    statuses = String(q.status).split(',');
    if (!statuses.every((s) => STATUSES.includes(s))) return bad('status');
  }
  let assignees = null;
  if (has(q, 'assignee')) {
    assignees = String(q.assignee).split(',');
    if (assignees.some((a) => a === '')) return bad('assignee');
  }
  let field = 'id';
  let dir = 1;
  if (has(q, 'sort')) {
    let s = String(q.sort);
    if (s.startsWith('-')) { dir = -1; s = s.slice(1); }
    if (!SORT_FIELDS.includes(s)) return bad('sort');
    field = s;
  }
  let limit = null;
  if (has(q, 'limit')) {
    if (!/^\d+$/.test(q.limit)) return bad('limit');
    limit = Number(q.limit);
    if (limit < 1 || limit > 100) return bad('limit');
  }
  const fp = JSON.stringify([q.status ?? null, q.assignee ?? null, q.sort ?? null]);
  let cursor = null;
  if (has(q, 'cursor')) {
    if (limit === null) return bad('cursor');
    cursor = decodeCursor(q.cursor);
    if (!cursor || cursor[0] !== fp) return bad('cursor');
    if (typeof cursor[1] !== (field === 'createdAt' ? 'string' : 'number')) return bad('cursor');
  }

  const cmp = (a, b) => {
    const x = a[field], y = b[field];
    if (x !== y) return (x < y ? -1 : 1) * dir;
    return a.id - b.id;
  };
  let list = tickets.filter((t) =>
    (!statuses || statuses.includes(t.status)) &&
    (!assignees || assignees.includes(t.assignee === null ? 'none' : t.assignee)));
  list.sort(cmp);
  if (limit === null) return { status: 200, body: list };

  if (cursor) {
    const after = { id: cursor[2], [field]: cursor[1] };
    if (field === 'id') after.id = cursor[1];
    list = list.filter((t) => cmp(t, after) > 0);
  }
  const items = list.slice(0, limit);
  let nextCursor = null;
  if (list.length > limit) {
    const last = items[items.length - 1];
    nextCursor = encodeCursor(fp, last[field], last.id);
  }
  return { status: 200, body: { items, nextCursor } };
}

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
