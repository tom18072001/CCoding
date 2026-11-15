import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const bad = (p) => ({ error: `invalid_${p}` });

function parseList(v) {
  if (typeof v !== 'string') return null;
  const parts = v.split(',');
  return parts.some((p) => p === '') ? null : parts;
}

/** Parse + validate query. Returns { error } or parsed options. First error in order status, assignee, sort, limit, cursor. */
function parseQuery(query) {
  const q = query ?? {};
  const o = { status: null, assignee: null, field: 'id', dir: 1, limit: null, cursor: null };
  if (q.status !== undefined) {
    const l = parseList(q.status);
    if (!l || !l.every((s) => STATUSES.includes(s))) return bad('status');
    o.status = new Set(l);
  }
  if (q.assignee !== undefined) {
    const l = parseList(q.assignee);
    if (!l) return bad('assignee');
    o.assignee = new Set(l);
  }
  let sortRaw = 'id';
  if (q.sort !== undefined) {
    if (typeof q.sort !== 'string') return bad('sort');
    const desc = q.sort.startsWith('-');
    const f = desc ? q.sort.slice(1) : q.sort;
    if (!SORT_FIELDS.includes(f)) return bad('sort');
    o.field = f;
    o.dir = desc ? -1 : 1;
    sortRaw = q.sort;
  }
  if (q.limit !== undefined) {
    if (typeof q.limit !== 'string' || !/^[0-9]+$/.test(q.limit)) return bad('limit');
    const n = Number(q.limit);
    if (n < 1 || n > 100) return bad('limit');
    o.limit = n;
  }
  const fp = JSON.stringify([
    o.status ? [...o.status].sort() : null,
    o.assignee ? [...o.assignee].sort() : null,
    sortRaw,
  ]);
  o.fp = fp;
  if (q.cursor !== undefined) {
    if (o.limit === null || typeof q.cursor !== 'string') return bad('cursor');
    const k = decodeCursor(q.cursor, fp, o.field);
    if (!k) return bad('cursor');
    o.cursor = k;
  }
  return o;
}

function encodeCursor(fp, k) {
  return Buffer.from(JSON.stringify({ v: 1, f: fp, k })).toString('base64url');
}

function decodeCursor(str, fp, field) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(str)) return null;
    const c = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (!c || typeof c !== 'object' || c.v !== 1 || c.f !== fp) return null;
    const k = c.k;
    if (!Array.isArray(k) || k.length !== 2) return null;
    const want = field === 'createdAt' ? 'string' : 'number';
    if (typeof k[0] !== want || !Number.isInteger(k[1])) return null;
    if (want === 'number' && !Number.isFinite(k[0])) return null;
    return k;
  } catch {
    return null;
  }
}

function cmp(field, dir) {
  return (a, b) => {
    const x = a[field], y = b[field];
    const d = x < y ? -1 : x > y ? 1 : 0;
    return d !== 0 ? d * dir : a.id - b.id;
  };
}

/** Create an in-memory request handler. req = { method, path, query: { [k]: string } } -> { status, body } */
export function createHandler(tickets = seed()) {
  return function handle(req) {
    if (req.method === 'GET' && req.path === '/tickets') {
      const o = parseQuery(req.query);
      if (o.error) return { status: 400, body: o };
      const compare = cmp(o.field, o.dir);
      let list = tickets.filter(
        (t) =>
          (!o.status || o.status.has(t.status)) &&
          (!o.assignee || o.assignee.has(t.assignee === null ? 'none' : t.assignee)),
      );
      list.sort(compare);
      if (o.limit === null) return { status: 200, body: list };
      if (o.cursor) {
        const key = { id: o.cursor[1], [o.field]: o.cursor[0] };
        list = list.filter((t) => compare(t, key) > 0);
      }
      const items = list.slice(0, o.limit);
      const last = items[items.length - 1];
      const nextCursor = list.length > o.limit ? encodeCursor(o.fp, [last[o.field], last.id]) : null;
      return { status: 200, body: { items, nextCursor } };
    }
    if (req.method === 'GET' && /^\/tickets\/\d+$/.test(req.path)) {
      const t = tickets.find((x) => x.id === Number(req.path.split('/')[2]));
      return t ? { status: 200, body: t } : { status: 404, body: { error: 'not_found' } };
    }
    return { status: 404, body: { error: 'not_found' } };
  };
}
