import { seed, STATUSES } from './data.js';

const SORT_FIELDS = ['id', 'priority', 'createdAt'];

const bad = (param) => ({ status: 400, body: { error: `invalid_${param}` } });

const sortValue = (t, field) => (field === 'createdAt' ? Date.parse(t.createdAt) : t[field]);

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(str) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(str)) return null;
    const p = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    if (typeof p.st !== 'string' || typeof p.as !== 'string' || typeof p.so !== 'string') return null;
    if (!Number.isInteger(p.id) || typeof p.v !== 'number' || !Number.isFinite(p.v)) return null;
    return p;
  } catch {
    return null;
  }
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

function listTickets(tickets, q) {
  const has = (k) => Object.prototype.hasOwnProperty.call(q, k) && q[k] !== undefined;

  let statuses = null;
  if (has('status')) {
    statuses = String(q.status).split(',');
    if (!statuses.every((s) => STATUSES.includes(s))) return bad('status');
  }

  let assignees = null;
  if (has('assignee')) assignees = String(q.assignee).split(',');

  let field = 'id';
  let desc = false;
  if (has('sort')) {
    let s = String(q.sort);
    if (s.startsWith('-')) {
      desc = true;
      s = s.slice(1);
    }
    if (!SORT_FIELDS.includes(s)) return bad('sort');
    field = s;
  }

  let limit = null;
  if (has('limit')) {
    const s = String(q.limit);
    if (!/^\d+$/.test(s)) return bad('limit');
    limit = Number(s);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return bad('limit');
  }

  // Normalized fingerprint so equivalent filters (order/duplicates) share cursors.
  const norm = (list) => (list ? [...new Set(list)].sort().join(',') : '');
  const fp = { st: norm(statuses), as: norm(assignees), so: `${desc ? '-' : ''}${field}` };

  let cur = null;
  if (has('cursor')) {
    if (limit === null) return bad('cursor');
    cur = decodeCursor(String(q.cursor));
    if (!cur || cur.st !== fp.st || cur.as !== fp.as || cur.so !== fp.so) return bad('cursor');
  }

  let items = tickets.filter((t) => {
    if (statuses && !statuses.includes(t.status)) return false;
    if (assignees) {
      const ok = t.assignee === null ? assignees.includes('none') : assignees.includes(t.assignee);
      if (!ok) return false;
    }
    return true;
  });

  const cmpKey = (av, aid, bv, bid) => {
    if (av !== bv) return desc ? bv - av : av - bv;
    return aid - bid;
  };
  items.sort((a, b) => cmpKey(sortValue(a, field), a.id, sortValue(b, field), b.id));

  if (limit === null) return { status: 200, body: items };

  if (cur) items = items.filter((t) => cmpKey(sortValue(t, field), t.id, cur.v, cur.id) > 0);

  const page = items.slice(0, limit);
  let nextCursor = null;
  if (items.length > limit) {
    const last = page[page.length - 1];
    nextCursor = encodeCursor({ ...fp, v: sortValue(last, field), id: last.id });
  }
  return { status: 200, body: { items: page, nextCursor } };
}
