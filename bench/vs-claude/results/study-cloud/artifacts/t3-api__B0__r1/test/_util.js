'use strict';
// Tiện ích dùng chung cho test S3 (không phải test).
const { start } = require('./helpers');

const NOW = new Date('2026-11-01T00:00:00Z');
const T = (id, o = {}) => ({ id, title: 'x', status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const USERS = [
  { id: 'u1', name: 'Admin', role: 'admin', team: null },
  { id: 'u2', name: 'MA', role: 'manager', team: 'A' },
  { id: 'u3', name: 'A1', role: 'member', team: 'A' },
  { id: 'u4', name: 'B1', role: 'member', team: 'B' },
  { id: 'u5', name: 'MB', role: 'manager', team: 'B' },
  { id: 'u6', name: 'A2', role: 'member', team: 'A' },
];

/** Chạy fn với server dùng seed mặc định (seed=undefined) hoặc seed tự tạo, now cố định. */
async function withApp(fn, seed) {
  const app = await start({ now: () => NOW, ...(seed ? { seed: JSON.parse(JSON.stringify(seed)) } : {}) });
  try { await fn(app); } finally { await app.close(); }
}
const as = (u) => ({ headers: { 'x-user': u } });
/** Gọi không kèm X-User (fetch thô). */
const anon = (app, method, path, body) =>
  fetch(app.base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => ({ status: r.status, json: await r.json().catch(() => undefined) }));
const ids = (r) => r.json.items.map((t) => t.id).join(',');

module.exports = { NOW, T, USERS, withApp, as, anon, ids };
