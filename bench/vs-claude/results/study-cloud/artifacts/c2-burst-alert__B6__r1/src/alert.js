/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5, cooldownMs = windowMs } = opts || {};
  const sorted = (events || [])
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e && Number.isInteger(e.status) && e.status >= 500 && e.status <= 599)
    .sort((a, b) => a.e.ts - b.e.ts || a.i - b.i)
    .map(({ e }) => e);

  const state = new Map(); // host -> { q, head, last }
  const alerts = [];
  for (const e of sorted) {
    let s = state.get(e.host);
    if (!s) {
      s = { q: [], head: 0, last: null };
      state.set(e.host, s);
    }
    s.q.push(e.ts);
    while (s.head < s.q.length && s.q[s.head] <= e.ts - windowMs) s.head++;
    const count = s.q.length - s.head;
    if (count >= threshold && (s.last === null || e.ts >= s.last + cooldownMs)) {
      alerts.push({ host: e.host, ts: e.ts, count });
      s.last = e.ts;
    }
  }
  return alerts.sort((a, b) =>
    a.ts !== b.ts ? a.ts - b.ts : a.host < b.host ? -1 : a.host > b.host ? 1 : 0
  );
}
