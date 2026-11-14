/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5 } = opts || {};
  const { cooldownMs = windowMs } = opts || {};

  const byHost = new Map();
  for (const e of events || []) {
    if (!e || typeof e.status !== 'number' || e.status < 500 || e.status > 599) continue;
    if (!Number.isFinite(e.ts)) continue;
    let list = byHost.get(e.host);
    if (!list) byHost.set(e.host, (list = []));
    list.push(e);
  }

  const alerts = [];
  for (const [host, list] of byHost) {
    const sorted = list.slice().sort((a, b) => a.ts - b.ts); // stable
    let start = 0;
    let lastAlert = null;
    for (let i = 0; i < sorted.length; i++) {
      const ts = sorted[i].ts;
      while (start < i && sorted[start].ts <= ts - windowMs) start++;
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
