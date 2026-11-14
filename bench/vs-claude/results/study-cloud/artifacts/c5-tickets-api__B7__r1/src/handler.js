import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const bad = (param) => ({ status: 400, body: { error: `invalid_${param}` } });
const str = (v) => (typeof v === 'string' ? v : undefined);

function encodeCursor(fp, key) {
  return Buffer.from(JSON.stringify({ f: fp, k: key })).toString('base64url');
}

function decodeCursor(raw, fp, field) {
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!c || c.f !== fp || !Array.isArray(c.k) || c.k.length !== 2) return null;
    const [v, id] = c.k;
    if (!Number.isInteger(id)) return null;
    if (field === 'createdAt' ? typeof v !== 'string' : !Number.isInteger(v)) return null;
    return { v, id };
  } catch {
    return null;
  }
}

function list(tickets, q) {
  const status = str(q.status);
  const assignee = str(q.assignee);
  const sortRaw = str(q.sort) ?? 'id';
  const limitRaw = str(q.limit);
  const cursorRaw = str(q.cursor);

  let statuses = null;
  if (q.status !== undefined) {
    statuses = status === undefined ? [] : status.split(',');
    if (!statuses.length || !statuses.every((s) => STATUSES.includes(s))) return bad('status');
  }
  let names = null;
  if (q.assignee !== undefined) {
    names = assignee === undefined ? [''] : assignee.split(',');
    if (names.some((n) => n === '')) return bad('assignee');
  }
  const desc = sortRaw.startsWith('-');
  const field = desc ? sortRaw.slice(1) : sortRaw;
  if (!SORT_FIELDS.includes(field)) return bad('sort');
  let limit = null;
  if (q.limit !== undefined) {
    if (limitRaw === undefined || !/^\d+$/.test(limitRaw)) return bad('limit');
    limit = Number(limitRaw);
    if (limit < 1 || limit > 100) return bad('limit');
  }
  if (q.cursor !== undefined && limit === null) return bad('cursor');

  const dir = desc ? -1 : 1;
  const cmp = (a, b) => {
    const x = a[field];
    const y = b[field];
    return (x < y ? -dir : x > y ? dir : 0) || a.id - b.id;
  };
  let rows = tickets.filter((t) =>
    (!statuses || statuses.includes(t.status)) &&
    (!names || (t.assignee === null ? names.includes('none') : names.includes(t.assignee))));
  rows.sort(cmp);
  if (limit === null) return { status: 200, body: rows };

  const fp = JSON.stringify([status ?? null, assignee ?? null, sortRaw]);
  if (q.cursor !== undefined) {
    const c = decodeCursor(cursorRaw ?? '', fp, field);
    if (!c) return bad('cursor');
    rows = rows.filter((t) => cmp(t, { [field]: c.v, id: c.id }) > 0);
  }
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor = rows.length > limit ? encodeCursor(fp, [last[field], last.id]) : null;
  return { status: 200, body: { items, nextCursor } };
}

/** Create an in-memory request handler. req = { method, path, query: { [k]: string } } -> { status, body } */
export function createHandler(tickets = seed()) {
  return function handle(req) {
    if (req.method === 'GET' && req.path === '/tickets') {
      return list(tickets, req.query ?? {});
    }
    if (req.method === 'GET' && /^\/tickets\/\d+$/.test(req.path)) {
      const t = tickets.find((x) => x.id === Number(req.path.split('/')[2]));
      return t ? { status: 200, body: t } : { status: 404, body: { error: 'not_found' } };
    }
    return { status: 404, body: { error: 'not_found' } };
  };
}
