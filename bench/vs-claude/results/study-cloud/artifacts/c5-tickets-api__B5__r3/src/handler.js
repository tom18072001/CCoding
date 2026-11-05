import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const has = (q, k) => Object.prototype.hasOwnProperty.call(q, k) && q[k] !== undefined;
const bad = (p) => ({ status: 400, body: { error: `invalid_${p}` } });

function encodeCursor(last, field, fp) {
  return Buffer.from(JSON.stringify({ i: last.id, k: last[field], f: fp }), 'utf8').toString('base64url');
}

function decodeCursor(str, field, fp) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
  try {
    const c = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (!c || typeof c !== 'object' || !Number.isInteger(c.i) || c.f !== fp) return null;
    if (typeof c.k !== (field === 'createdAt' ? 'string' : 'number')) return null;
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

      let field = 'id';
      let dir = 1;
      if (has(q, 'sort')) {
        let s = String(q.sort);
        if (s.startsWith('-')) { dir = -1; s = s.slice(1); }
        if (!SORT_FIELDS.includes(s)) return bad('sort');
        field = s;
      }

      let limit = null;
      if (has(q, 'limit')) {
        const l = String(q.limit);
        if (!/^\d+$/.test(l)) return bad('limit');
        limit = Number(l);
        if (limit < 1 || limit > 100) return bad('limit');
      }

      const fp = JSON.stringify([has(q, 'status') ? String(q.status) : null, has(q, 'assignee') ? String(q.assignee) : null, has(q, 'sort') ? String(q.sort) : 'id']);
      let cur = null;
      if (has(q, 'cursor')) {
        if (limit === null) return bad('cursor');
        cur = decodeCursor(q.cursor, field, fp);
        if (!cur) return bad('cursor');
      }

      const cmp = (a, b) => {
        const x = a[field], y = b[field];
        if (x !== y) return (x < y ? -1 : 1) * dir;
        return a.id - b.id;
      };

      let list = tickets.filter((t) =>
        (!statuses || statuses.includes(t.status)) &&
        (!assignees || assignees.some((a) => (a === 'none' ? t.assignee === null : t.assignee === a))));
      list.sort(cmp);

      if (limit === null) return { status: 200, body: list };

      if (cur) {
        const pos = { id: cur.i, [field]: cur.k };
        list = list.filter((t) => cmp(t, pos) > 0);
      }
      const items = list.slice(0, limit);
      const nextCursor = list.length > limit ? encodeCursor(items[items.length - 1], field, fp) : null;
      return { status: 200, body: { items, nextCursor } };
    }
    if (req.method === 'GET' && /^\/tickets\/\d+$/.test(req.path)) {
      const t = tickets.find((x) => x.id === Number(req.path.split('/')[2]));
      return t ? { status: 200, body: t } : { status: 404, body: { error: 'not_found' } };
    }
    return { status: 404, body: { error: 'not_found' } };
  };
}
