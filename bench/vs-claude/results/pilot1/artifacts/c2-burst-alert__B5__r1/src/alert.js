/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5 } = opts;
  const cooldownMs = opts.cooldownMs ?? windowMs;
  const sorted = events
    .filter((e) => e && e.status >= 500 && e.status <= 599)
    .map((e, i) => ({ ts: e.ts, host: e.host, i }))
    .sort((a, b) => a.ts - b.ts || a.i - b.i); // stable: ties keep input order
  const state = new Map(); // host -> { q: number[], head, lastAlert }
  const alerts = [];
  for (const e of sorted) {
    let s = state.get(e.host);
    if (!s) state.set(e.host, (s = { q: [], head: 0, lastAlert: -Infinity }));
    s.q.push(e.ts);
    while (s.q[s.head] <= e.ts - windowMs) s.head++;
    const count = s.q.length - s.head;
    if (count >= threshold && e.ts >= s.lastAlert + cooldownMs) {
      s.lastAlert = e.ts;
      alerts.push({ host: e.host, ts: e.ts, count });
    }
  }
  return alerts.sort((a, b) => a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
}
