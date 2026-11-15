/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5, cooldownMs = windowMs } = opts;
  const byHost = new Map();
  for (const e of events) {
    if (!(e.status >= 500 && e.status <= 599)) continue;
    let list = byHost.get(e.host);
    if (!list) byHost.set(e.host, (list = []));
    list.push(e.ts);
  }
  const alerts = [];
  for (const [host, tsList] of byHost) {
    // Array.prototype.sort is stable: equal ts keep input order.
    const sorted = tsList.slice().sort((a, b) => a - b);
    let start = 0;
    let lastAlert = null;
    for (let i = 0; i < sorted.length; i++) {
      const ts = sorted[i];
      while (sorted[start] <= ts - windowMs) start++;
      const count = i - start + 1;
      if (count >= threshold && (lastAlert === null || ts >= lastAlert + cooldownMs)) {
        alerts.push({ host, ts, count });
        lastAlert = ts;
      }
    }
  }
  return alerts.sort((a, b) => a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
}
