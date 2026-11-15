import { STATUSES } from './data.js';

const SORTS = ['id', 'priority', 'createdAt'];
const has = (q, k) => Object.prototype.hasOwnProperty.call(q, k) && q[k] !== undefined;
const fail = (param) => ({ status: 400, body: { error: `invalid_${param}` } });

function splitList(s) {
  if (typeof s !== 'string') return null;
  const parts = s.split(',');
  return parts.some((p) => p === '') ? null : parts;
}

function decodeCursor(raw) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const o = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!o || typeof o !== 'object' || typeof o.f !== 'string') return null;
    if (!Array.isArray(o.v) || o.v.length !== 2) return null;
    if (!Number.isInteger(o.v[1])) return null;
    return o;
  } catch {
    return null;
  }
}

/** Pure: (tickets, query) -> { status, body }. Does not mutate tickets. */
export function listTickets(tickets, query = {}) {
  const q = query || {};
  let statuses = null;
  if (has(q, 'status')) {
    statuses = splitList(q.status);
    if (!statuses || statuses.some((s) => !STATUSES.includes(s))) return fail('status');
  }
  let assignees = null;
  if (has(q, 'assignee')) {
    assignees = splitList(q.assignee);
    if (!assignees) return fail('assignee');
  }
  let sort = 'id';
  if (has(q, 'sort')) sort = q.sort;
  const desc = typeof sort === 'string' && sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (typeof sort !== 'string' || !SORTS.includes(field)) return fail('sort');
  const dir = desc ? -1 : 1;

  let limit = null;
  if (has(q, 'limit')) {
    if (typeof q.limit !== 'string' || !/^\d+$/.test(q.limit)) return fail('limit');
    limit = Number(q.limit);
    if (limit < 1 || limit > 100) return fail('limit');
  }

  const fingerprint = `${has(q, 'status') ? q.status : ''}|${has(q, 'assignee') ? q.assignee : ''}|${sort}`;
  let cur = null;
  if (has(q, 'cursor')) {
    if (limit === null) return fail('cursor');
    cur = decodeCursor(q.cursor);
    if (!cur || cur.f !== fingerprint) return fail('cursor');
    const t = cur.v[0];
    if (field === 'createdAt' ? typeof t !== 'string' : typeof t !== 'number') return fail('cursor');
  }

  const cmpKey = (ka, ia, kb, ib) => (ka < kb ? -dir : ka > kb ? dir : 0) || ia - ib;
  const cmp = (a, b) => cmpKey(a[field], a.id, b[field], b.id);

  let list = tickets.filter(
    (t) =>
      (!statuses || statuses.includes(t.status)) &&
      (!assignees || assignees.some((a) => (a === 'none' ? t.assignee === null : t.assignee === a))),
  );
  list.sort(cmp);
  if (limit === null) return { status: 200, body: list };

  if (cur) list = list.filter((t) => cmpKey(t[field], t.id, cur.v[0], cur.v[1]) > 0);
  const items = list.slice(0, limit);
  let nextCursor = null;
  if (list.length > limit) {
    const last = items[items.length - 1];
    nextCursor = Buffer.from(JSON.stringify({ v: [last[field], last.id], f: fingerprint })).toString('base64url');
  }
  return { status: 200, body: { items, nextCursor } };
}
