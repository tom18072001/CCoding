/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5, cooldownMs = windowMs } = opts;

  // Group 5xx events by host, remembering original index for stable ordering.
  const byHost = new Map();
  events.forEach((e, i) => {
    if (e.status >= 500 && e.status <= 599) {
      let list = byHost.get(e.host);
      if (!list) {
        list = [];
        byHost.set(e.host, list);
      }
      list.push({ ts: e.ts, i });
    }
  });

  const alerts = [];
  for (const [host, list] of byHost) {
    list.sort((a, b) => a.ts - b.ts || a.i - b.i);
    let left = 0;
    let last = null;
    for (let right = 0; right < list.length; right++) {
      const ts = list[right].ts;
      while (list[left].ts <= ts - windowMs) left++;
      const count = right - left + 1;
      if (count >= threshold && (last === null || ts >= last + cooldownMs)) {
        alerts.push({ host, ts, count });
        last = ts;
      }
    }
  }

  alerts.sort((a, b) => a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
  return alerts;
}
