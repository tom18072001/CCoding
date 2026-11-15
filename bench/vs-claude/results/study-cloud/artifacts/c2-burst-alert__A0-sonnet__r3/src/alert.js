/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5 } = opts;
  const { cooldownMs = windowMs } = opts;

  // Group 5xx events by host (input order preserved), then stable-sort by ts.
  const byHost = new Map();
  for (const e of events) {
    if (e && e.status >= 500 && e.status <= 599) {
      if (!byHost.has(e.host)) byHost.set(e.host, []);
      byHost.get(e.host).push(e.ts);
    }
  }

  const alerts = [];
  for (const [host, times] of byHost) {
    const ts = times.slice().sort((a, b) => a - b); // stable
    let start = 0;
    let lastAlert = null;
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      while (ts[start] <= t - windowMs) start++;
      const count = i - start + 1;
      if (count >= threshold && (lastAlert === null || t >= lastAlert + cooldownMs)) {
        alerts.push({ host, ts: t, count });
        lastAlert = t;
      }
    }
  }

  alerts.sort((a, b) => a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
  return alerts;
}
