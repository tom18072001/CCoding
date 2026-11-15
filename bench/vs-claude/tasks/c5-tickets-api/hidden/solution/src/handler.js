import { seed, STATUSES } from './data.js';
const bad = (p) => ({ status: 400, body: { error: `invalid_${p}` } });
export function createHandler(tickets = seed()) {
  return function handle(req) {
    const q = req.query ?? {};
    if (req.method === 'GET' && req.path === '/tickets') {
      let list = [...tickets];
      if (q.status !== undefined) { const s = q.status.split(','); if (!s.every((x) => STATUSES.includes(x))) return bad('status'); list = list.filter((t) => s.includes(t.status)); }
      if (q.assignee !== undefined) { const a = q.assignee.split(','); list = list.filter((t) => a.includes(t.assignee === null ? 'none' : t.assignee)); }
      const sort = q.sort ?? 'id'; const desc = sort.startsWith('-'); const f = desc ? sort.slice(1) : sort;
      if (!['id', 'priority', 'createdAt'].includes(f)) return bad('sort');
      list.sort((a, b) => { const c = a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : 0; return (desc ? -c : c) || a.id - b.id; });
      if (q.limit === undefined) { if (q.cursor !== undefined) return bad('cursor'); return { status: 200, body: list }; }
      if (!/^\d+$/.test(q.limit) || +q.limit < 1 || +q.limit > 100) return bad('limit');
      const sig = JSON.stringify([q.status ?? null, q.assignee ?? null, sort]); let off = 0;
      if (q.cursor !== undefined) { try { const c = JSON.parse(Buffer.from(q.cursor, 'base64url').toString()); if (c.sig !== sig || !Number.isInteger(c.off) || c.off < 0) return bad('cursor'); off = c.off; } catch { return bad('cursor'); } }
      const items = list.slice(off, off + +q.limit); const next = off + +q.limit;
      return { status: 200, body: { items, nextCursor: next < list.length ? Buffer.from(JSON.stringify({ sig, off: next })).toString('base64url') : null } };
    }
    if (req.method === 'GET' && /^\/tickets\/\d+$/.test(req.path)) {
      const t = tickets.find((x) => x.id === Number(req.path.split('/')[2]));
      return t ? { status: 200, body: t } : { status: 404, body: { error: 'not_found' } };
    }
    return { status: 404, body: { error: 'not_found' } };
  };
}
