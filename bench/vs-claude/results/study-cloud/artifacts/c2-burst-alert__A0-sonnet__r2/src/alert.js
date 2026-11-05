/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5 } = opts;
  const cooldownMs = opts.cooldownMs ?? windowMs;

  // Stable sort of a copy (Array.prototype.sort is stable) keeps input order for ties.
  const byHost = new Map();
  for (const e of [...events].sort((a, b) => a.ts - b.ts)) {
    if (!(e.status >= 500 && e.status <= 599)) continue;
    let list = byHost.get(e.host);
    if (!list) byHost.set(e.host, (list = []));
    list.push(e.ts);
  }

  const alerts = [];
  for (const [host, times] of byHost) {
    let start = 0;
    let lastAlert = -Infinity;
    for (let i = 0; i < times.length; i++) {
      const ts = times[i];
      while (times[start] <= ts - windowMs) start++;
      const count = i - start + 1;
      if (count >= threshold && ts >= lastAlert + cooldownMs) {
        alerts.push({ host, ts, count });
        lastAlert = ts;
      }
    }
  }

  alerts.sort((a, b) => a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
  return alerts;
}
