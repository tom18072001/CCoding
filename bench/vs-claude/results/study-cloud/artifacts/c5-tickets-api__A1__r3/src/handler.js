import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];

const bad = (param) => ({ status: 400, body: { error: `invalid_${param}` } });

function parseList(raw) {
  if (typeof raw !== 'string') return null;
  const items = raw.split(',');
  if (items.some((s) => s === '')) return null;
  return items;
}

const canon = (list) => (list ? [...new Set(list)].sort() : null);

function encodeCursor(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

function decodeCursor(raw) {
  if (typeof raw !== 'string' || raw === '' || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    if (typeof c.f !== 'string' || typeof c.id !== 'number' || !Number.isInteger(c.id)) return null;
    if (typeof c.v !== 'number' && typeof c.v !== 'string') return null;
    if (typeof c.sig !== 'string') return null;
    return c;
  } catch {
    return null;
  }
}

function compare(field, dir) {
  return (a, b) => {
    const x = a[field];
    const y = b[field];
    if (x !== y) return (x < y ? -1 : 1) * dir;
    return a.id - b.id;
  };
}

/** Create an in-memory request handler. req = { method, path, query: { [k]: string } } -> { status, body } */
export function createHandler(tickets = seed()) {
  return function handle(req) {
    if (req.method === 'GET' && req.path === '/tickets') {
      const q = req.query ?? {};
      const has = (k) => Object.prototype.hasOwnProperty.call(q, k) && q[k] !== undefined;

      let statuses = null;
      if (has('status')) {
        statuses = parseList(q.status);
        if (!statuses || !statuses.every((s) => STATUSES.includes(s))) return bad('status');
      }
      let assignees = null;
      if (has('assignee')) {
        assignees = parseList(q.assignee);
        if (!assignees) return bad('assignee');
      }
      let sortRaw = 'id';
      if (has('sort')) sortRaw = q.sort;
      if (typeof sortRaw !== 'string') return bad('sort');
      const desc = sortRaw.startsWith('-');
      const field = desc ? sortRaw.slice(1) : sortRaw;
      if (!SORT_FIELDS.includes(field)) return bad('sort');
      const dir = desc ? -1 : 1;

      let limit = null;
      if (has('limit')) {
        if (typeof q.limit !== 'string' || !/^\d+$/.test(q.limit)) return bad('limit');
        limit = Number(q.limit);
        if (limit < 1 || limit > 100) return bad('limit');
      }

      const sig = JSON.stringify([canon(statuses), canon(assignees), sortRaw]);
      let cursor = null;
      if (has('cursor')) {
        if (limit === null) return bad('cursor');
        cursor = decodeCursor(q.cursor);
        if (!cursor || cursor.sig !== sig || cursor.f !== field) return bad('cursor');
        if (typeof cursor.v !== (field === 'createdAt' ? 'string' : 'number')) return bad('cursor');
      }

      let list = tickets.filter(
        (t) =>
          (!statuses || statuses.includes(t.status)) &&
          (!assignees ||
            (t.assignee === null ? assignees.includes('none') : assignees.includes(t.assignee))),
      );
      list.sort(compare(field, dir));

      if (limit === null) return { status: 200, body: list };

      if (cursor) {
        const cmp = compare(field, dir);
        const marker = { id: cursor.id, [field]: cursor.v };
        list = list.filter((t) => cmp(t, marker) > 0);
      }
      const items = list.slice(0, limit);
      let nextCursor = null;
      if (list.length > limit) {
        const last = items[items.length - 1];
        nextCursor = encodeCursor({ sig, f: field, v: last[field], id: last.id });
      }
      return { status: 200, body: { items, nextCursor } };
    }
    if (req.method === 'GET' && /^\/tickets\/\d+$/.test(req.path)) {
      const t = tickets.find((x) => x.id === Number(req.path.split('/')[2]));
      return t ? { status: 200, body: t } : { status: 404, body: { error: 'not_found' } };
    }
    return { status: 404, body: { error: 'not_found' } };
  };
}
