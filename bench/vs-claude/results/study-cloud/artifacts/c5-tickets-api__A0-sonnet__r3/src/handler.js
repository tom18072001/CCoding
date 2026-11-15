import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const bad = (p) => ({ status: 400, body: { error: `invalid_${p}` } });

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(s) {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    if (!c || typeof c !== 'object' || !Array.isArray(c.f) || c.f.length !== 3) return null;
    if (!c.f.every((x) => typeof x === 'string')) return null;
    if (!Number.isInteger(c.id)) return null;
    return c;
  } catch {
    return null;
  }
}

/** Parse and apply list query. Returns { status, body }. */
function listTickets(tickets, query) {
  const q = query || {};
  const has = (k) => q[k] !== undefined;
  const str = (k) => (typeof q[k] === 'string' ? q[k] : null);

  let statuses = null;
  if (has('status')) {
    const raw = str('status');
    if (raw === null) return bad('status');
    statuses = raw.split(',');
    if (!statuses.every((s) => STATUSES.includes(s))) return bad('status');
  }

  let assignees = null;
  if (has('assignee')) {
    const raw = str('assignee');
    if (raw === null) return bad('assignee');
    assignees = raw.split(',');
    if (assignees.some((a) => a === '')) return bad('assignee');
  }

  let field = 'id';
  let dir = 1;
  if (has('sort')) {
    let raw = str('sort');
    if (raw === null) return bad('sort');
    if (raw.startsWith('-')) {
      dir = -1;
      raw = raw.slice(1);
    }
    if (!SORT_FIELDS.includes(raw)) return bad('sort');
    field = raw;
  }

  let limit = null;
  if (has('limit')) {
    const raw = str('limit');
    if (raw === null || !/^\d+$/.test(raw)) return bad('limit');
    limit = Number(raw);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return bad('limit');
  }

  // fingerprint of the values a cursor is bound to
  const fp = [str('status') ?? '', str('assignee') ?? '', str('sort') ?? ''];
  // distinguish absent from empty-string is unnecessary: empty is invalid for all three
  let cursor = null;
  if (has('cursor')) {
    const raw = str('cursor');
    if (raw === null || limit === null) return bad('cursor');
    cursor = decodeCursor(raw);
    if (!cursor || cursor.f.some((x, i) => x !== fp[i])) return bad('cursor');
    const kt = field === 'createdAt' ? 'string' : 'number';
    if (field !== 'id' && typeof cursor.k !== kt) return bad('cursor');
  }

  const cmp = (a, b) => {
    if (field === 'id') return (a.id - b.id) * dir;
    if (a[field] !== b[field]) return (a[field] < b[field] ? -1 : 1) * dir;
    return a.id - b.id;
  };

  let items = tickets.filter(
    (t) =>
      (!statuses || statuses.includes(t.status)) &&
      (!assignees || assignees.includes(t.assignee === null ? 'none' : t.assignee)),
  );
  items.sort(cmp);
  if (limit === null) return { status: 200, body: items };

  if (cursor) {
    const last = { id: cursor.id, [field]: field === 'id' ? cursor.id : cursor.k };
    items = items.filter((t) => cmp(t, last) > 0);
  }
  const page = items.slice(0, limit);
  let nextCursor = null;
  if (items.length > limit) {
    const l = page[page.length - 1];
    nextCursor = encodeCursor({ f: fp, id: l.id, k: l[field] });
  }
  return { status: 200, body: { items: page, nextCursor } };
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
