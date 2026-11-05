/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5 } = opts;
  const cooldownMs = opts.cooldownMs ?? windowMs;

  // Group 5xx events by host, keeping input order (Array.prototype.sort is stable).
  const byHost = new Map();
  for (const e of events) {
    if (!(e.status >= 500 && e.status <= 599)) continue;
    let list = byHost.get(e.host);
    if (!list) byHost.set(e.host, (list = []));
    list.push(e.ts);
  }

  const alerts = [];
  for (const [host, list] of byHost) {
    const tss = list.slice().sort((a, b) => a - b);
    let start = 0;
    let lastAlert = null;
    for (let i = 0; i < tss.length; i++) {
      const ts = tss[i];
      while (tss[start] <= ts - windowMs) start++;
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
