/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5 } = opts;
  const cooldownMs = opts.cooldownMs ?? windowMs;

  // Copy + stable sort by ts (ties keep input order); input is not mutated.
  const sorted = events
    .filter((e) => e.status >= 500 && e.status <= 599)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.ts - b.e.ts || a.i - b.i)
    .map((x) => x.e);

  const state = new Map(); // host -> { times: number[], start: number, lastAlert: number|null }
  const alerts = [];
  for (const { ts, host } of sorted) {
    let s = state.get(host);
    if (!s) state.set(host, (s = { times: [], start: 0, lastAlert: null }));
    s.times.push(ts);
    while (s.times[s.start] <= ts - windowMs) s.start++;
    const count = s.times.length - s.start;
    if (count >= threshold && (s.lastAlert === null || ts >= s.lastAlert + cooldownMs)) {
      s.lastAlert = ts;
      alerts.push({ host, ts, count });
    }
  }
  return alerts.sort((a, b) => a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
}
