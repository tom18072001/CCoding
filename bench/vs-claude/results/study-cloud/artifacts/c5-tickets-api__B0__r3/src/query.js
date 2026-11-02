import { STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];
const has = (q, k) => q[k] !== undefined;
const fail = (param) => ({ error: `invalid_${param}` });

function parseList(v) {
  if (typeof v !== 'string') return null;
  const parts = v.split(',').map((s) => s.trim());
  return parts.some((s) => s === '') ? null : [...new Set(parts)];
}

/** Parse + validate query. Returns { error } or { value }. Order: status, assignee, sort, limit, cursor. */
export function parseQuery(query) {
  const q = query && typeof query === 'object' ? query : {};
  const v = { status: null, assignee: null, sort: 'id', desc: false, limit: null, cursor: null };
  if (has(q, 'status')) {
    const l = parseList(q.status);
    if (!l || !l.every((s) => STATUSES.includes(s))) return fail('status');
    v.status = l;
  }
  if (has(q, 'assignee')) {
    const l = parseList(q.assignee);
    if (!l) return fail('assignee');
    v.assignee = l;
  }
  if (has(q, 'sort')) {
    if (typeof q.sort !== 'string') return fail('sort');
    const desc = q.sort.startsWith('-');
    const field = desc ? q.sort.slice(1) : q.sort;
    if (!SORT_FIELDS.includes(field)) return fail('sort');
    v.sort = field;
    v.desc = desc;
  }
  if (has(q, 'limit')) {
    if (typeof q.limit !== 'string' || !/^[1-9]\d*$/.test(q.limit) || Number(q.limit) > 100) return fail('limit');
    v.limit = Number(q.limit);
  }
  if (has(q, 'cursor')) {
    if (typeof q.cursor !== 'string' || v.limit === null) return fail('cursor');
    const c = decodeCursor(q.cursor);
    if (!c || c.f !== fingerprint(v)) return fail('cursor');
    v.cursor = c;
  }
  return { value: v };
}

export function fingerprint(v) {
  return JSON.stringify([v.status ? [...v.status].sort() : null, v.assignee ? [...v.assignee].sort() : null, (v.desc ? '-' : '') + v.sort]);
}

export function encodeCursor(v, ticket) {
  return Buffer.from(JSON.stringify({ f: fingerprint(v), k: ticket[v.sort], i: ticket.id })).toString('base64url');
}

export function decodeCursor(s) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    if (!c || typeof c !== 'object' || typeof c.f !== 'string' || !Number.isInteger(c.i)) return null;
    if (typeof c.k !== 'number' && typeof c.k !== 'string') return null;
    return c;
  } catch {
    return null;
  }
}

/** Comparator: by sort key (direction aware), ties by id ascending. */
export function compare(v) {
  const dir = v.desc ? -1 : 1;
  return (a, b) => {
    const x = a[v.sort], y = b[v.sort];
    if (x !== y) return (x < y ? -1 : 1) * dir;
    return a.id - b.id;
  };
}

export function runQuery(tickets, v) {
  let r = tickets;
  if (v.status) r = r.filter((t) => v.status.includes(t.status));
  if (v.assignee) r = r.filter((t) => v.assignee.some((a) => (a === 'none' ? t.assignee === null : t.assignee === a)));
  const cmp = compare(v);
  r = [...r].sort(cmp);
  if (v.limit === null) return r;
  if (v.cursor) {
    // Cursor key type must match the sort field's type (a forged cursor with the right fingerprint but wrong type yields an empty page).
    const sample = tickets[0];
    if (sample && typeof sample[v.sort] !== typeof v.cursor.k) return { items: [], nextCursor: null };
    const pos = { id: v.cursor.i, [v.sort]: v.cursor.k };
    r = r.filter((t) => cmp(t, pos) > 0);
  }
  const items = r.slice(0, v.limit);
  const nextCursor = r.length > v.limit ? encodeCursor(v, items[items.length - 1]) : null;
  return { items, nextCursor };
}
