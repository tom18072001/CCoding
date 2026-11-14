import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const bad = (p) => ({ status: 400, body: { error: `invalid_${p}` } });
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function decodeCursor(str, fp, sortField) {
  try {
    const c = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (!c || c.fp !== fp || !Number.isInteger(c.id)) return null;
    if (sortField === 'createdAt' ? typeof c.v !== 'string' : !Number.isFinite(c.v)) return null;
    return c;
  } catch {
    return null;
  }
}

function listTickets(tickets, q) {
  const str = (k) => q[k] === undefined ? undefined : q[k];
  for (const k of ['status', 'assignee', 'sort', 'limit', 'cursor']) {
    if (str(k) !== undefined && typeof str(k) !== 'string') return bad(k);
  }
  let statuses = null;
  if (q.status !== undefined) {
    statuses = q.status.split(',');
    if (!statuses.every((s) => STATUSES.includes(s))) return bad('status');
  }
  const assignees = q.assignee !== undefined ? q.assignee.split(',') : null;

  let field = 'id', dir = 1;
  if (q.sort !== undefined) {
    let s = q.sort;
    if (s.startsWith('-')) { dir = -1; s = s.slice(1); }
    if (!SORT_FIELDS.includes(s)) return bad('sort');
    field = s;
  }

  let limit = null;
  if (q.limit !== undefined) {
    if (!/^\d+$/.test(q.limit)) return bad('limit');
    limit = Number(q.limit);
    if (limit < 1 || limit > 100) return bad('limit');
  }

  const fp = JSON.stringify([q.status ?? null, q.assignee ?? null, (dir < 0 ? '-' : '') + field]);
  let cur = null;
  if (q.cursor !== undefined) {
    if (limit === null) return bad('cursor');
    cur = decodeCursor(q.cursor, fp, field);
    if (!cur) return bad('cursor');
  }

  let items = tickets.filter((t) =>
    (!statuses || statuses.includes(t.status)) &&
    (!assignees || assignees.some((a) => (a === 'none' ? t.assignee === null : t.assignee === a))));
  items.sort((a, b) => dir * cmp(a[field], b[field]) || a.id - b.id);

  if (limit === null) return { status: 200, body: items };

  if (cur) {
    items = items.filter((t) => {
      const c = dir * cmp(t[field], cur.v);
      return c > 0 || (c === 0 && t.id > cur.id);
    });
  }
  const page = items.slice(0, limit);
  let nextCursor = null;
  if (items.length > limit) {
    const last = page[page.length - 1];
    nextCursor = Buffer.from(JSON.stringify({ fp, v: last[field], id: last.id })).toString('base64url');
  }
  return { status: 200, body: { items: page, nextCursor } };
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
