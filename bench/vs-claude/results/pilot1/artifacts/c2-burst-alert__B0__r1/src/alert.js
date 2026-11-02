/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5 } = opts;
  const { cooldownMs = windowMs } = opts;

  const byHost = new Map();
  events.forEach((e, idx) => {
    if (e.status >= 500 && e.status <= 599) {
      let list = byHost.get(e.host);
      if (!list) byHost.set(e.host, (list = []));
      list.push({ ts: e.ts, host: e.host, status: e.status, idx });
    }
  });

  const alerts = [];
  for (const [host, list] of byHost) {
    list.sort((a, b) => a.ts - b.ts || a.idx - b.idx);
    let start = 0;
    let lastAlertTs = null;
    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      while (list[start].ts <= cur.ts - windowMs) start++;
      const count = i - start + 1;
      if (count >= threshold && (lastAlertTs === null || cur.ts >= lastAlertTs + cooldownMs)) {
        alerts.push({ host, ts: cur.ts, count });
        lastAlertTs = cur.ts;
      }
    }
  }

  alerts.sort((a, b) => a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
  return alerts;
}
