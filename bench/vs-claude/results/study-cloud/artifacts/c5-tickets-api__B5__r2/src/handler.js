import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const has = (q, k) => Object.prototype.hasOwnProperty.call(q, k) && q[k] !== undefined;
const bad = (param) => ({ status: 400, body: { error: `invalid_${param}` } });
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function encodeCursor(fp, v, id) {
  return Buffer.from(JSON.stringify({ fp, v, id })).toString('base64url');
}

function decodeCursor(str, fp, field) {
  try {
    if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
    const c = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (!c || c.fp !== fp || !Number.isInteger(c.id)) return null;
    if (typeof c.v !== (field === 'createdAt' ? 'string' : 'number')) return null;
    return c;
  } catch {
    return null;
  }
}

function listTickets(tickets, q) {
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
  let desc = false;
  if (has(q, 'sort')) {
    const raw = String(q.sort);
    desc = raw.startsWith('-');
    field = desc ? raw.slice(1) : raw;
    if (!SORT_FIELDS.includes(field)) return bad('sort');
  }
  let limit = null;
  if (has(q, 'limit')) {
    if (!/^\d+$/.test(String(q.limit))) return bad('limit');
    limit = Number(q.limit);
    if (limit < 1 || limit > 100) return bad('limit');
  }
  const hasCursor = has(q, 'cursor');
  if (hasCursor && limit === null) return bad('cursor');
  const raw = (k) => (has(q, k) ? String(q[k]) : null);
  const fp = JSON.stringify([raw('status'), raw('assignee'), raw('sort')]);
  let cur = null;
  if (hasCursor) {
    cur = decodeCursor(q.cursor, fp, field);
    if (!cur) return bad('cursor');
  }

  let list = tickets.filter(
    (t) =>
      (!statuses || statuses.includes(t.status)) &&
      (!assignees || assignees.some((a) => (a === 'none' ? t.assignee === null : t.assignee === a))),
  );
  const dir = desc ? -1 : 1;
  const order = (a, b) => dir * cmp(a[field], b[field]) || a.id - b.id;
  list.sort(order);
  if (limit === null) return { status: 200, body: list };

  if (cur) list = list.filter((t) => order(t, { [field]: cur.v, id: cur.id }) > 0);
  const items = list.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor = list.length > limit ? encodeCursor(fp, last[field], last.id) : null;
  return { status: 200, body: { items, nextCursor } };
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
