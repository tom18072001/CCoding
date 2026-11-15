/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5 } = opts;
  const cooldownMs = opts.cooldownMs ?? windowMs;

  // Stable sort of a copy (Array.prototype.sort is stable); input is not mutated.
  const sorted = (Array.isArray(events) ? events : [])
    .filter(
      (e) =>
        e != null &&
        typeof e.ts === 'number' && Number.isFinite(e.ts) &&
        typeof e.status === 'number' && e.status >= 500 && e.status <= 599
    )
    .slice()
    .sort((a, b) => a.ts - b.ts);

  const state = new Map(); // host -> { win: number[], head: number, last: number|null }
  const alerts = [];

  for (const e of sorted) {
    let s = state.get(e.host);
    if (!s) {
      s = { win: [], head: 0, last: null };
      state.set(e.host, s);
    }
    s.win.push(e.ts);
    while (s.head < s.win.length && s.win[s.head] <= e.ts - windowMs) s.head++;
    const count = s.win.length - s.head;
    if (count >= threshold && (s.last === null || e.ts >= s.last + cooldownMs)) {
      alerts.push({ host: e.host, ts: e.ts, count });
      s.last = e.ts;
    }
  }

  alerts.sort((a, b) => a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
  return alerts;
}
