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
const err = (param) => ({ status: 400, body: { error: `invalid_${param}` } });
const has = (q, k) => Object.prototype.hasOwnProperty.call(q, k);

/** Parse a comma-separated list; null if any element is empty / not accepted. */
function parseList(raw, accept) {
  if (typeof raw !== 'string') return null;
  const parts = raw.split(',');
  return parts.every((p) => p !== '' && accept(p)) ? parts : null;
}

function encodeCursor(v, id, sig) {
  return Buffer.from(JSON.stringify({ v, i: id, s: sig }), 'utf8').toString('base64url');
}

/** Returns { v, i } or null when malformed / signature mismatch / wrong types. */
function decodeCursor(raw, sig, field) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  let c;
  try {
    c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!c || typeof c !== 'object' || Array.isArray(c) || c.s !== sig) return null;
  if (!Number.isInteger(c.i)) return null;
  if (field === 'createdAt' ? typeof c.v !== 'string' : !Number.isFinite(c.v)) return null;
  return { v: c.v, i: c.i };
}

/**
 * GET /tickets with filters, sort and keyset pagination.
 * Validation order (first failure wins): status, assignee, sort, limit,
 * cursor (cursor without limit -> invalid_cursor; then decode + signature check).
 * Unknown query params are ignored. Without params: bare array sorted by id.
 * Cursor signature = sorted-unique status set + sorted-unique assignee set + sort string.
 */
function listTickets(tickets, q) {
  let statuses = null;
  if (has(q, 'status')) {
    statuses = parseList(q.status, (v) => STATUSES.includes(v));
    if (!statuses) return err('status');
  }
  let assignees = null;
  if (has(q, 'assignee')) {
    assignees = parseList(q.assignee, () => true);
    if (!assignees) return err('assignee');
  }
  let sort = 'id';
  if (has(q, 'sort')) {
    sort = q.sort;
    if (typeof sort !== 'string' || !SORT_FIELDS.includes(sort.replace(/^-/, ''))) return err('sort');
  }
  let limit = null;
  if (has(q, 'limit')) {
    if (typeof q.limit !== 'string' || !/^\d+$/.test(q.limit)) return err('limit');
    limit = Number(q.limit);
    if (limit < 1 || limit > 100) return err('limit');
  }
  const uniq = (a) => (a ? [...new Set(a)].sort() : null);
  const sig = JSON.stringify([uniq(statuses), uniq(assignees), sort]);
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  let cur = null;
  if (has(q, 'cursor')) {
    if (limit === null) return err('cursor');
    cur = decodeCursor(q.cursor, sig, field);
    if (!cur) return err('cursor');
  }

  const dir = desc ? -1 : 1;
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  let items = tickets.filter(
    (t) =>
      (!statuses || statuses.includes(t.status)) &&
      (!assignees || assignees.includes(t.assignee === null ? 'none' : t.assignee)),
  );
  items.sort((a, b) => dir * cmp(a[field], b[field]) || a.id - b.id);
  if (limit === null) return { status: 200, body: items };

  if (cur) {
    items = items.filter((t) => {
      const c = dir * cmp(t[field], cur.v);
      return c > 0 || (c === 0 && t.id > cur.i);
    });
  }
  const page = items.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = items.length > limit ? encodeCursor(last[field], last.id, sig) : null;
  return { status: 200, body: { items: page, nextCursor } };
}
