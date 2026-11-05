/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5 } = opts || {};
  const cooldownMs = (opts && opts.cooldownMs !== undefined) ? opts.cooldownMs : windowMs;

  const byHost = new Map();
  (events || []).forEach((e, i) => {
    if (e && e.status >= 500 && e.status <= 599) {
      let list = byHost.get(e.host);
      if (!list) byHost.set(e.host, (list = []));
      list.push({ ts: e.ts, i });
    }
  });

  const alerts = [];
  for (const [host, list] of byHost) {
    list.sort((a, b) => a.ts - b.ts || a.i - b.i);
    let start = 0;
    let last = null;
    for (let k = 0; k < list.length; k++) {
      const ts = list[k].ts;
      while (list[start].ts <= ts - windowMs) start++;
      const count = k - start + 1;
      if (count >= threshold && (last === null || ts >= last + cooldownMs)) {
        alerts.push({ host, ts, count });
        last = ts;
      }
    }
  }

  alerts.sort((a, b) => a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
  return alerts;
}
