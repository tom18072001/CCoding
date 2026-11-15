import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const bad = (param) => ({ status: 400, body: { error: `invalid_${param}` } });
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function encodeCursor(fp, last, field) {
  return Buffer.from(JSON.stringify({ fp, k: last[field], id: last.id }), 'utf8').toString('base64url');
}

function decodeCursor(str, fp) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
  try {
    const c = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (!c || c.fp !== fp || !Number.isInteger(c.id)) return null;
    if (typeof c.k !== 'number' && typeof c.k !== 'string') return null;
    return c;
  } catch {
    return null;
  }
}

/** Create an in-memory request handler. req = { method, path, query: { [k]: string } } -> { status, body } */
export function createHandler(tickets = seed()) {
  return function handle(req) {
    if (req.method === 'GET' && req.path === '/tickets') {
      const q = req.query || {};
      let list = [...tickets];

      if (q.status !== undefined) {
        const wanted = q.status.split(',');
        if (!wanted.every((v) => STATUSES.includes(v))) return bad('status');
        list = list.filter((t) => wanted.includes(t.status));
      }
      if (q.assignee !== undefined) {
        const names = q.assignee.split(',');
        list = list.filter((t) => (t.assignee === null ? names.includes('none') : names.includes(t.assignee)));
      }

      const sort = q.sort === undefined ? 'id' : q.sort;
      const desc = sort.startsWith('-');
      const field = desc ? sort.slice(1) : sort;
      if (!SORT_FIELDS.includes(field)) return bad('sort');
      const dir = desc ? -1 : 1;
      const order = (a, b) => dir * cmp(a[field], b[field]) || a.id - b.id;
      list.sort(order);

      if (q.limit === undefined) {
        if (q.cursor !== undefined) return bad('cursor');
        return { status: 200, body: list };
      }
      if (!/^\d+$/.test(q.limit)) return bad('limit');
      const limit = Number(q.limit);
      if (limit < 1 || limit > 100) return bad('limit');

      const fp = JSON.stringify([q.status ?? null, q.assignee ?? null, sort]);
      if (q.cursor !== undefined) {
        const c = decodeCursor(q.cursor, fp);
        if (!c) return bad('cursor');
        const after = { id: c.id, [field]: c.k };
        list = list.filter((t) => order(t, after) > 0);
      }
      const items = list.slice(0, limit);
      const nextCursor = list.length > limit ? encodeCursor(fp, items[items.length - 1], field) : null;
      return { status: 200, body: { items, nextCursor } };
    }
    if (req.method === 'GET' && /^\/tickets\/\d+$/.test(req.path)) {
      const t = tickets.find((x) => x.id === Number(req.path.split('/')[2]));
      return t ? { status: 200, body: t } : { status: 404, body: { error: 'not_found' } };
    }
    return { status: 404, body: { error: 'not_found' } };
  };
}
