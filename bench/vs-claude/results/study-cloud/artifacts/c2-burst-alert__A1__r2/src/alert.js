/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5 } = opts;
  const { cooldownMs = windowMs } = opts;
  const byHost = new Map();
  for (const e of events) {
    if (!e || !(e.status >= 500 && e.status <= 599)) continue;
    if (!byHost.has(e.host)) byHost.set(e.host, []);
    byHost.get(e.host).push(e.ts);
  }
  const alerts = [];
  for (const [host, list] of byHost) {
    const times = list.slice().sort((a, b) => a - b); // stable; equal ts are interchangeable
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
