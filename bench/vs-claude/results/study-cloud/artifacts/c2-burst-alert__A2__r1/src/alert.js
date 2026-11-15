/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5 } = opts;
  const cooldownMs = opts.cooldownMs ?? windowMs;

  // Group 5xx events by host (input order preserved), then stable-sort by ts.
  const byHost = new Map();
  for (const e of events) {
    if (!(e.status >= 500 && e.status <= 599)) continue;
    let list = byHost.get(e.host);
    if (!list) byHost.set(e.host, (list = []));
    list.push(e.ts);
  }

  const alerts = [];
  for (const [host, list] of byHost) {
    const times = list.slice().sort((a, b) => a - b); // stable
    let start = 0;
    let lastAlert = null;
    for (let i = 0; i < times.length; i++) {
      const ts = times[i];
      while (times[start] <= ts - windowMs) start++;
      const count = i - start + 1;
      if (count >= threshold && (lastAlert === null || ts >= lastAlert + cooldownMs)) {
        alerts.push({ host, ts, count });
        lastAlert = ts;
      }
    }
  }

  alerts.sort((a, b) => a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
  return alerts;
}
