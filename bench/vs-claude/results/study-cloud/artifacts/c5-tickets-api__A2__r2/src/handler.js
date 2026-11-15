import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const bad = (p) => ({ status: 400, body: { error: `invalid_${p}` } });

function decodeCursor(str, binding) {
  try {
    const c = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (!c || typeof c !== 'object' || c.s !== binding.s || c.a !== binding.a || c.o !== binding.o) return null;
    if (!Number.isInteger(c.id)) return null;
    const field = binding.o.replace(/^-/, '');
    if (field === 'createdAt' ? typeof c.v !== 'string' : !Number.isInteger(c.v)) return null;
    return c;
  } catch {
    return null;
  }
}

function listTickets(tickets, q) {
  const raw = (k) => (q[k] === undefined ? undefined : q[k]);
  for (const k of ['status', 'assignee', 'sort', 'limit', 'cursor']) {
    if (raw(k) !== undefined && typeof raw(k) !== 'string') return bad(k);
  }

  let statuses = null;
  if (q.status !== undefined) {
    statuses = q.status.split(',');
    if (!statuses.every((s) => STATUSES.includes(s))) return bad('status');
  }
  let assignees = null;
  if (q.assignee !== undefined) {
    assignees = q.assignee.split(',');
    if (assignees.some((a) => a === '')) return bad('assignee');
  }
  const sortRaw = q.sort ?? 'id';
  const desc = sortRaw.startsWith('-');
  const field = desc ? sortRaw.slice(1) : sortRaw;
  if (!SORT_FIELDS.includes(field)) return bad('sort');

  let limit = null;
  if (q.limit !== undefined) {
    if (!/^\d+$/.test(q.limit)) return bad('limit');
    limit = Number(q.limit);
    if (limit < 1 || limit > 100) return bad('limit');
  }
  let cursor = null;
  if (q.cursor !== undefined) {
    if (limit === null) return bad('cursor');
    cursor = decodeCursor(q.cursor, { s: q.status ?? null, a: q.assignee ?? null, o: sortRaw });
    if (!cursor) return bad('cursor');
  }

  const dir = desc ? -1 : 1;
  const cmpVal = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  const cmp = (a, b) => dir * cmpVal(a[field], b[field]) || a.id - b.id;

  let items = tickets.filter(
    (t) =>
      (!statuses || statuses.includes(t.status)) &&
      (!assignees || assignees.some((a) => (a === 'none' ? t.assignee === null : t.assignee === a))),
  );
  items.sort(cmp);
  if (limit === null) return { status: 200, body: items };

  if (cursor) {
    const pos = { id: cursor.id, [field]: cursor.v };
    items = items.filter((t) => cmp(t, pos) > 0);
  }
  const page = items.slice(0, limit);
  let nextCursor = null;
  if (items.length > limit) {
    const last = page[page.length - 1];
    nextCursor = Buffer.from(
      JSON.stringify({ s: q.status ?? null, a: q.assignee ?? null, o: sortRaw, v: last[field], id: last.id }),
    ).toString('base64url');
  }
  return { status: 200, body: { items: page, nextCursor } };
}

/** Create an in-memory request handler. req = { method, path, query: { [k]: string } } -> { status, body } */
export function createHandler(tickets = seed()) {
  return function handle(req) {
    if (req.method === 'GET' && req.path === '/tickets') {
      return listTickets(tickets, req.query ?? {});
    }
    if (req.method === 'GET' && /^\/tickets\/\d+$/.test(req.path)) {
      const t = tickets.find((x) => x.id === Number(req.path.split('/')[2]));
      return t ? { status: 200, body: t } : { status: 404, body: { error: 'not_found' } };
    }
    return { status: 404, body: { error: 'not_found' } };
  };
}
