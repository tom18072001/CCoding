import { seed, STATUSES } from './data.js';

const SORTS = ['id', 'priority', 'createdAt'];
const bad = (p) => ({ status: 400, body: { error: `invalid_${p}` } });
const list = (v) => v.split(',');
const norm = (arr) => [...new Set(arr)].sort();

function cmp(field, desc) {
  return (a, b) => {
    const x = a[field], y = b[field];
    if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1);
    return a.id - b.id;
  };
}

function decodeCursor(c, binding, field) {
  try {
    const o = JSON.parse(Buffer.from(c, 'base64url').toString('utf8'));
    if (!o || o.b !== binding || !Number.isInteger(o.id)) return null;
    if (typeof o.v !== (field === 'createdAt' ? 'string' : 'number')) return null;
    return o;
  } catch {
    return null;
  }
}

function listTickets(tickets, q) {
  const has = (k) => Object.prototype.hasOwnProperty.call(q, k);
  const str = (k) => (has(k) && typeof q[k] === 'string' ? q[k] : has(k) ? null : undefined);

  let statuses, assignees;
  const st = str('status');
  if (st !== undefined) {
    if (st === null) return bad('status');
    statuses = list(st);
    if (!statuses.every((x) => STATUSES.includes(x))) return bad('status');
  }
  const as = str('assignee');
  if (as !== undefined) {
    if (as === null) return bad('assignee');
    assignees = list(as);
    if (assignees.some((x) => x === '')) return bad('assignee');
  }
  let field = 'id', desc = false;
  const so = str('sort');
  if (so !== undefined) {
    if (so === null) return bad('sort');
    desc = so.startsWith('-');
    field = desc ? so.slice(1) : so;
    if (!SORTS.includes(field)) return bad('sort');
  }
  let limit;
  const li = str('limit');
  if (li !== undefined) {
    if (li === null || !/^\d+$/.test(li)) return bad('limit');
    limit = Number(li);
    if (limit < 1 || limit > 100) return bad('limit');
  }
  const cu = str('cursor');
  if (cu !== undefined && (cu === null || cu === '' || limit === undefined)) return bad('cursor');

  const binding = JSON.stringify([statuses ? norm(statuses) : null, assignees ? norm(assignees) : null, (desc ? '-' : '') + field]);
  let after = null;
  if (cu !== undefined) {
    after = decodeCursor(cu, binding, field);
    if (!after) return bad('cursor');
  }

  let rows = tickets.filter(
    (t) =>
      (!statuses || statuses.includes(t.status)) &&
      (!assignees || (t.assignee === null ? assignees.includes('none') : assignees.includes(t.assignee))),
  );
  const c = cmp(field, desc);
  rows.sort(c);
  if (limit === undefined) return { status: 200, body: rows };

  if (after) rows = rows.filter((t) => c(t, { [field]: after.v, id: after.id }) > 0);
  const items = rows.slice(0, limit);
  let nextCursor = null;
  if (rows.length > limit) {
    const last = items[items.length - 1];
    nextCursor = Buffer.from(JSON.stringify({ b: binding, v: last[field], id: last.id })).toString('base64url');
  }
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
