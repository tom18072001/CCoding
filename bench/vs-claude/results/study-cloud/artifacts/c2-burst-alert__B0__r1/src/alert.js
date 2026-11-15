/** Detect per-host bursts of 5xx responses. See the task brief. */
export function detectBursts(events, opts = {}) {
  const windowMs = opts.windowMs ?? 60000;
  const threshold = opts.threshold ?? 5;
  const cooldownMs = opts.cooldownMs ?? windowMs;

  const items = [];
  (events ?? []).forEach((e, idx) => {
    if (e.status >= 500 && e.status <= 599) {
      items.push({ ts: e.ts, host: e.host, status: e.status, idx });
    }
  });
  items.sort((a, b) => a.ts - b.ts || a.idx - b.idx);

  const states = new Map(); // host -> { q: number[], head: number, last: number|null }
  const alerts = [];
  for (const cur of items) {
    let st = states.get(cur.host);
    if (!st) {
      st = { q: [], head: 0, last: null };
      states.set(cur.host, st);
    }
    st.q.push(cur.ts);
    while (st.head < st.q.length && st.q[st.head] <= cur.ts - windowMs) st.head++;
    const count = st.q.length - st.head;
    if (count >= threshold && (st.last === null || cur.ts >= st.last + cooldownMs)) {
      alerts.push({ host: cur.host, ts: cur.ts, count });
      st.last = cur.ts;
    }
    if (st.head > 1024 && st.head * 2 > st.q.length) {
      st.q = st.q.slice(st.head);
      st.head = 0;
    }
  }

  alerts.sort((a, b) => a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
  return alerts;
}
