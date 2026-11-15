/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5 } = opts;
  const cooldownMs = opts.cooldownMs ?? windowMs;

  // Group 5xx events per host (input order kept), without mutating input.
  const byHost = new Map();
  for (const e of events) {
    if (!(e.status >= 500 && e.status <= 599)) continue;
    let list = byHost.get(e.host);
    if (!list) byHost.set(e.host, (list = []));
    list.push(e.ts);
  }

  const alerts = [];
  for (const [host, list] of byHost) {
    list.sort((a, b) => a - b); // stable: equal ts keep input order
    let start = 0;
    let nextAllowed = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const ts = list[i];
      while (list[start] <= ts - windowMs) start++;
      const count = i - start + 1;
      if (count >= threshold && ts >= nextAllowed) {
        alerts.push({ host, ts, count });
        nextAllowed = ts + cooldownMs;
      }
    }
  }
  alerts.sort((a, b) => a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
  return alerts;
}
