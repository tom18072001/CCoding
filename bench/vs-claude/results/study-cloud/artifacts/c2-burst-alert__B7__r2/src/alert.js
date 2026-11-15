/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5, cooldownMs = windowMs } = opts;
  // Copy + stable sort by ts (Array.prototype.sort is stable): equal ts keep input order.
  const sorted = events
    .filter((e) => e && e.status >= 500 && e.status <= 599)
    .slice()
    .sort((a, b) => a.ts - b.ts);

  const state = new Map(); // host -> { times: number[], head: number, lastAlert: number }
  const alerts = [];
  for (const e of sorted) {
    let s = state.get(e.host);
    if (!s) {
      s = { times: [], head: 0, lastAlert: -Infinity };
      state.set(e.host, s);
    }
    s.times.push(e.ts);
    while (s.times[s.head] <= e.ts - windowMs) s.head++;
    const count = s.times.length - s.head;
    if (count >= threshold && e.ts >= s.lastAlert + cooldownMs) {
      s.lastAlert = e.ts;
      alerts.push({ host: e.host, ts: e.ts, count });
    }
  }
  alerts.sort((a, b) => a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
  return alerts;
}
