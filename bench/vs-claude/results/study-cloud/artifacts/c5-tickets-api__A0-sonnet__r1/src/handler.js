import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const bad = (p) => ({ status: 400, body: { error: `invalid_${p}` } });
const has = (q, k) => Object.hasOwn(q, k) && q[k] !== undefined;

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function encodeCursor(fp, t, field) {
  return Buffer.from(JSON.stringify({ f: fp, v: t[field], id: t.id })).toString('base64url');
}

function decodeCursor(s, fp, field) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    if (!c || typeof c !== 'object' || c.f !== fp) return null;
    if (!Number.isInteger(c.id)) return null;
    if (field === 'createdAt' ? typeof c.v !== 'string' : typeof c.v !== 'number') return null;
    return c;
  } catch {
    return null;
  }
}

function listTickets(tickets, query) {
  const q = query || {};
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
  let sort = 'id';
  if (has(q, 'sort')) {
    sort = String(q.sort);
  }
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (!SORT_FIELDS.includes(field)) return bad('sort');

  let limit = null;
  if (has(q, 'limit')) {
    const s = String(q.limit);
    if (!/^\d+$/.test(s)) return bad('limit');
    limit = Number(s);
    if (limit < 1 || limit > 100) return bad('limit');
  }
  let cursorRaw = null;
  if (has(q, 'cursor')) {
    if (limit === null) return bad('cursor');
    cursorRaw = q.cursor;
  }
  const fp = JSON.stringify([has(q, 'status') ? q.status : null, has(q, 'assignee') ? q.assignee : null, sort]);
  let cursor = null;
  if (cursorRaw !== null) {
    cursor = decodeCursor(cursorRaw, fp, field);
    if (!cursor) return bad('cursor');
  }

  const order = (a, b) => (desc ? -1 : 1) * cmp(a[field], b[field]) || a.id - b.id;
  let list = tickets.filter(
    (t) =>
      (!statuses || statuses.includes(t.status)) &&
      (!assignees || assignees.some((a) => (a === 'none' ? t.assignee === null : t.assignee === a))),
  );
  list.sort(order);

  if (limit === null) return { status: 200, body: list };

  if (cursor) list = list.filter((t) => order(t, { id: cursor.id, [field]: cursor.v }) > 0);
  const items = list.slice(0, limit);
  const nextCursor = list.length > limit ? encodeCursor(fp, items[items.length - 1], field) : null;
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
