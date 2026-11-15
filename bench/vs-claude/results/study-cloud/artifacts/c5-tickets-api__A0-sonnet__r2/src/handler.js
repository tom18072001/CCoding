import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const bad = (p) => ({ status: 400, body: { error: `invalid_${p}` } });

function encodeCursor(c) {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

function decodeCursor(str) {
  if (!/^[A-Za-z0-9_-]+$/.test(str)) return null;
  try {
    const c = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (!c || typeof c !== 'object') return null;
    if (typeof c.st !== 'string' || typeof c.as !== 'string' || typeof c.so !== 'string') return null;
    if (!Number.isInteger(c.id)) return null;
    if (typeof c.v !== 'number' && typeof c.v !== 'string') return null;
    return c;
  } catch {
    return null;
  }
}

/** Create an in-memory request handler. req = { method, path, query: { [k]: string } } -> { status, body } */
export function createHandler(tickets = seed()) {
  function listTickets(query) {
    const has = (k) => Object.hasOwn(query, k) && query[k] !== undefined;

    let statuses = null;
    if (has('status')) {
      statuses = String(query.status).split(',');
      if (!statuses.every((s) => STATUSES.includes(s))) return bad('status');
    }

    let assignees = null;
    if (has('assignee')) assignees = String(query.assignee).split(',');

    const sortRaw = has('sort') ? String(query.sort) : 'id';
    const desc = sortRaw.startsWith('-');
    const field = desc ? sortRaw.slice(1) : sortRaw;
    if (!SORT_FIELDS.includes(field)) return bad('sort');

    let limit = null;
    if (has('limit')) {
      const l = String(query.limit);
      if (!/^\d+$/.test(l)) return bad('limit');
      limit = Number(l);
      if (limit < 1 || limit > 100) return bad('limit');
    }

    let cursor = null;
    const stRaw = has('status') ? String(query.status) : '';
    const asRaw = has('assignee') ? String(query.assignee) : '';
    if (has('cursor')) {
      if (limit === null) return bad('cursor');
      cursor = decodeCursor(String(query.cursor));
      if (!cursor || cursor.st !== stRaw || cursor.as !== asRaw || cursor.so !== sortRaw) return bad('cursor');
    }

    const value = (t) => (field === 'createdAt' ? Date.parse(t.createdAt) : t[field]);
    const cmpKey = (va, ia, vb, ib) => {
      if (va !== vb) return (va < vb ? -1 : 1) * (desc ? -1 : 1);
      return ia - ib;
    };
    const cmp = (a, b) => cmpKey(value(a), a.id, value(b), b.id);

    let rows = tickets.filter(
      (t) =>
        (!statuses || statuses.includes(t.status)) &&
        (!assignees || assignees.some((a) => (a === 'none' ? t.assignee === null : t.assignee === a))),
    );
    rows.sort(cmp);

    if (limit === null) return { status: 200, body: rows };

    if (cursor) {
      // a cursor's key must be comparable with the sort field's values
      if (typeof cursor.v !== 'number') return bad('cursor');
      rows = rows.filter((t) => cmpKey(value(t), t.id, cursor.v, cursor.id) > 0);
    }
    const items = rows.slice(0, limit);
    let nextCursor = null;
    if (rows.length > limit) {
      const last = items[items.length - 1];
      nextCursor = encodeCursor({ st: stRaw, as: asRaw, so: sortRaw, v: value(last), id: last.id });
    }
    return { status: 200, body: { items, nextCursor } };
  }

  return function handle(req) {
    if (req.method === 'GET' && req.path === '/tickets') {
      return listTickets(req.query ?? {});
    }
    if (req.method === 'GET' && /^\/tickets\/\d+$/.test(req.path)) {
      const t = tickets.find((x) => x.id === Number(req.path.split('/')[2]));
      return t ? { status: 200, body: t } : { status: 404, body: { error: 'not_found' } };
    }
    return { status: 404, body: { error: 'not_found' } };
  };
}
