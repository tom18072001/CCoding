import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const bad = (p) => ({ status: 400, body: { error: `invalid_${p}` } });
const keyOf = (t, f) => (f === 'createdAt' ? Date.parse(t.createdAt) : t[f]);
const list = (v) => (typeof v === 'string' && v !== '' ? v.split(',') : null);

function encodeCursor(fp, last, field) {
  return Buffer.from(JSON.stringify({ fp, id: last.id, v: last[field] })).toString('base64url');
}
function decodeCursor(str, fp, field) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(str)) return null;
    const c = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (!c || c.fp !== fp || !Number.isInteger(c.id)) return null;
    const k = keyOf({ id: c.id, priority: c.v, createdAt: c.v }, field);
    if (field !== 'createdAt' && typeof c.v !== 'number' && field !== 'id') return null;
    if (field === 'createdAt' && typeof c.v !== 'string') return null;
    if (typeof k !== 'number' || !Number.isFinite(k)) return null;
    return { id: c.id, key: k };
  } catch {
    return null;
  }
}

function listTickets(tickets, q = {}) {
  let statuses = null;
  if (q.status !== undefined) {
    statuses = list(q.status);
    if (!statuses || !statuses.every((s) => STATUSES.includes(s))) return bad('status');
  }
  let assignees = null;
  if (q.assignee !== undefined) {
    assignees = list(q.assignee);
    if (!assignees) return bad('assignee');
  }
  let field = 'id';
  let dir = 1;
  if (q.sort !== undefined) {
    if (typeof q.sort !== 'string') return bad('sort');
    const desc = q.sort.startsWith('-');
    field = desc ? q.sort.slice(1) : q.sort;
    if (!SORT_FIELDS.includes(field)) return bad('sort');
    dir = desc ? -1 : 1;
  }
  let limit = null;
  if (q.limit !== undefined) {
    if (typeof q.limit !== 'string' || !/^\d+$/.test(q.limit)) return bad('limit');
    limit = Number(q.limit);
    if (limit < 1 || limit > 100) return bad('limit');
  }
  if (q.cursor !== undefined && limit === null) return bad('cursor');

  const fp = JSON.stringify([
    statuses ? [...new Set(statuses)].sort() : null,
    assignees ? [...new Set(assignees)].sort() : null,
    (dir < 0 ? '-' : '') + field,
  ]);
  let after = null;
  if (q.cursor !== undefined) {
    if (typeof q.cursor !== 'string') return bad('cursor');
    after = decodeCursor(q.cursor, fp, field);
    if (!after) return bad('cursor');
  }

  const cmp = (a, b) => {
    const ka = keyOf(a, field);
    const kb = keyOf(b, field);
    if (ka !== kb) return ka < kb ? -dir : dir;
    return a.id - b.id;
  };
  let items = tickets.filter(
    (t) =>
      (!statuses || statuses.includes(t.status)) &&
      (!assignees || assignees.some((a) => (a === 'none' ? t.assignee === null : t.assignee === a))),
  );
  items.sort(cmp);
  if (limit === null) return { status: 200, body: items };
  if (after) {
    const ref = { id: after.id, [field]: after.key, createdAt: new Date(after.key).toISOString() };
    items = items.filter((t) => cmp(t, ref) > 0);
  }
  const page = items.slice(0, limit);
  const nextCursor = items.length > limit ? encodeCursor(fp, page[page.length - 1], field) : null;
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
