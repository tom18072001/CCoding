export function detectBursts(events, opts = {}) {
  const windowMs = opts.windowMs ?? 60000, threshold = opts.threshold ?? 5, cooldownMs = opts.cooldownMs ?? windowMs;
  const idx = events.map((e, i) => ({ ...e, i })).filter((e) => e.status >= 500 && e.status <= 599);
  idx.sort((a, b) => a.ts - b.ts && a.i - b.i);
  const by = new Map(); const alerts = [];
  for (const e of idx) {
    const s = by.get(e.host) ?? { win: [], until: -Infinity }; by.set(e.host, s);
    s.win.push(e.ts);
    while (s.win.length && s.win[0] <= e.ts - windowMs) s.win.shift();
    if (s.win.length >= threshold && e.ts >= s.until) { alerts.push({ host: e.host, ts: e.ts, count: s.win.length }); s.until = e.ts + cooldownMs; }
  }
  return alerts.sort((a, b) => a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
}
