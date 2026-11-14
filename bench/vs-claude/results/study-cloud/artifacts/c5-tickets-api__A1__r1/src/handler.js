import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const bad = (p) => ({ status: 400, body: { error: `invalid_${p}` } });
const has = (q, k) => Object.prototype.hasOwnProperty.call(q, k) && q[k] !== undefined;

function encodeCursor(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function decodeCursor(str) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(str)) return null;
    const o = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (!o || typeof o !== 'object' || typeof o.f !== 'string') return null;
    if (!Number.isInteger(o.id) || !(typeof o.v === 'number' || typeof o.v === 'string')) return null;
    return o;
  } catch {
    return null;
  }
}

function listTickets(tickets, q) {
  let statuses = null;
  if (has(q, 'status')) {
    if (typeof q.status !== 'string') return bad('status');
    statuses = q.status.split(',');
    if (!statuses.every((s) => STATUSES.includes(s))) return bad('status');
  }
  let assignees = null;
  if (has(q, 'assignee')) {
    if (typeof q.assignee !== 'string') return bad('assignee');
    assignees = q.assignee.split(',');
    if (assignees.some((a) => a === '')) return bad('assignee');
  }
  let sort = 'id';
  if (has(q, 'sort')) {
    if (typeof q.sort !== 'string') return bad('sort');
    sort = q.sort;
  }
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (!SORT_FIELDS.includes(field)) return bad('sort');

  let limit = null;
  if (has(q, 'limit')) {
    if (typeof q.limit !== 'string' || !/^\d+$/.test(q.limit)) return bad('limit');
    limit = Number(q.limit);
    if (limit < 1 || limit > 100) return bad('limit');
  }
  // signature of the values a cursor is bound to (effective values)
  const sig = JSON.stringify([statuses ? q.status : null, assignees ? q.assignee : null, sort]);
  let after = null;
  if (has(q, 'cursor')) {
    if (limit === null || typeof q.cursor !== 'string') return bad('cursor');
    after = decodeCursor(q.cursor);
    if (!after || after.f !== sig) return bad('cursor');
  }

  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    const x = a[field], y = b[field];
    if (x !== y) return (x < y ? -1 : 1) * dir;
    return a.id - b.id;
  };
  let list = tickets.filter(
    (t) =>
      (!statuses || statuses.includes(t.status)) &&
      (!assignees || assignees.some((a) => (a === 'none' ? t.assignee === null : t.assignee === a))),
  );
  list.sort(cmp);
  if (limit === null) return { status: 200, body: list };

  if (after) {
    const marker = { id: after.id, [field]: after.v };
    list = list.filter((t) => cmp(t, marker) > 0);
  }
  const items = list.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor =
    list.length > limit ? encodeCursor({ f: sig, id: last.id, v: last[field] }) : null;
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
