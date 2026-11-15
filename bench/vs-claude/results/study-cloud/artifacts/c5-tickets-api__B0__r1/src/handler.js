import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const err = (param) => ({ status: 400, body: { error: `invalid_${param}` } });
const norm = (list) => (list ? [...new Set(list)].sort().join(',') : null);

function parseList(raw) {
  if (raw === undefined) return null;
  return String(raw).split(',');
}

function listTickets(tickets, query) {
  const q = query || {};
  const has = (k) => q[k] !== undefined;

  const statuses = parseList(q.status);
  if (statuses && !statuses.every((s) => STATUSES.includes(s))) return err('status');
  const assignees = parseList(q.assignee);
  if (assignees && assignees.some((a) => a === '')) return err('assignee');

  let field = 'id';
  let dir = 1;
  if (has('sort')) {
    let sv = String(q.sort);
    if (sv.startsWith('-')) { dir = -1; sv = sv.slice(1); }
    if (!SORT_FIELDS.includes(sv)) return err('sort');
    field = sv;
  }
  const sortNorm = (dir === -1 ? '-' : '') + field;

  let limit = null;
  if (has('limit')) {
    const lv = String(q.limit);
    if (!/^[0-9]+$/.test(lv)) return err('limit');
    limit = Number(lv);
    if (limit < 1 || limit > 100) return err('limit');
  }

  const cmp = (a, b) => {
    const x = a[field];
    const y = b[field];
    if (x !== y) return (x < y ? -1 : 1) * dir;
    return a.id - b.id;
  };

  const sNorm = norm(statuses);
  const aNorm = norm(assignees);
  let after = null;
  if (has('cursor')) {
    if (limit === null) return err('cursor');
    try {
      const c = JSON.parse(Buffer.from(String(q.cursor), 'base64url').toString('utf8'));
      const kOk = field === 'createdAt' ? typeof c.k === 'string' : typeof c.k === 'number' && Number.isFinite(c.k);
      if (!c || typeof c !== 'object' || c.s !== sNorm || c.a !== aNorm || c.o !== sortNorm || !kOk || !Number.isInteger(c.i)) {
        return err('cursor');
      }
      after = { [field]: c.k, id: c.i };
    } catch {
      return err('cursor');
    }
  }

  let list = tickets.filter((t) => (!statuses || statuses.includes(t.status))
    && (!assignees || assignees.some((a) => (a === 'none' ? t.assignee === null : t.assignee === a))));
  list.sort(cmp);
  if (limit === null) return { status: 200, body: list };

  if (after) list = list.filter((t) => cmp(t, after) > 0);
  const items = list.slice(0, limit);
  let nextCursor = null;
  if (list.length > limit) {
    const last = items[items.length - 1];
    nextCursor = Buffer.from(JSON.stringify({ s: sNorm, a: aNorm, o: sortNorm, k: last[field], i: last.id })).toString('base64url');
  }
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
