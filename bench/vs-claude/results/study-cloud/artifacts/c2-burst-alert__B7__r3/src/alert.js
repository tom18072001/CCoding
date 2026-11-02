/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const { windowMs = 60000, threshold = 5 } = opts;
  const cooldownMs = opts.cooldownMs ?? windowMs;

  const byHost = new Map();
  for (const e of events) {
    if (e.status >= 500 && e.status <= 599) {
      if (!byHost.has(e.host)) byHost.set(e.host, []);
      byHost.get(e.host).push(e.ts);
    }
  }

  const alerts = [];
  for (const [host, list] of byHost) {
    const ts = list.slice().sort((a, b) => a - b); // stable: equal ts keep input order
    let lo = 0;
    let lastAlert = null;
    for (let i = 0; i < ts.length; i++) {
      while (ts[lo] <= ts[i] - windowMs) lo++;
      const count = i - lo + 1;
      if (count >= threshold && (lastAlert === null || ts[i] >= lastAlert + cooldownMs)) {
        alerts.push({ host, ts: ts[i], count });
        lastAlert = ts[i];
      }
    }
  }

  alerts.sort((a, b) => a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
  return alerts;
}
