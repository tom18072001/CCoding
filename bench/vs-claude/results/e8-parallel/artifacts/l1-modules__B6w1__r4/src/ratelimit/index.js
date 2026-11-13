// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now/setTimeout.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isInteger(v) && v >= 1;

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  if (typeof options.now !== 'function') throw err('RL_INVALID_OPTIONS');
  for (const n of names) if (!isPosInt(options[n])) throw err('RL_INVALID_OPTIONS');
}

function checkInput(key, cost, max) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw err('RL_INVALID_COST');
  if (cost > max) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const o = {
    ...options,
    refillAmount: options.refillAmount === undefined ? 1 : options.refillAmount,
    refillIntervalMs: options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs,
  };
  checkOptions(o, ['capacity', 'refillAmount', 'refillIntervalMs']);
  const { capacity, refillAmount, refillIntervalMs: I, now } = o;
  const cap = capacity * I; // token nhân với refillIntervalMs (số nguyên)
  const keys = new Map(); // key -> { s, last }

  // Trạng thái sau khi nạp bù tại thời điểm n (không đổi state gốc).
  function refilled(st, n) {
    if (n <= st.last) return { s: st.s, last: st.last };
    return { s: Math.min(cap, st.s + (n - st.last) * refillAmount), last: n };
  }

  function run(key, cost, commit) {
    cost = checkInput(key, cost, capacity);
    const n = now();
    const cur = refilled(keys.get(key) || { s: cap, last: n }, n);
    const need = cost * I;
    if (cur.s >= need) {
      if (!commit) return { allowed: true, retryAfterMs: 0, remaining: Math.floor(cur.s / I) };
      cur.s -= need;
      keys.set(key, cur);
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(cur.s / I) };
    }
    if (commit) keys.set(key, cur);
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - cur.s) / refillAmount),
      remaining: Math.floor(cur.s / I),
    };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset: (key) => keys.delete(key),
    sweep() {
      const n = now();
      let removed = 0;
      for (const [k, st] of [...keys]) {
        if (refilled(st, n).s >= cap) {
          keys.delete(k);
          removed++;
        }
      }
      return removed;
    },
    size: () => keys.size,
  };
}

export function createSlidingWindow(options) {
  checkOptions(options, ['limit', 'windowMs']);
  const { limit, windowMs, now } = options;
  const keys = new Map(); // key -> [{ t, cost }]

  const live = (events, n) => events.filter((e) => e.t > n - windowMs);

  function run(key, cost, commit) {
    cost = checkInput(key, cost, limit);
    const n = now();
    const events = live(keys.get(key) || [], n);
    const used = events.reduce((a, e) => a + e.cost, 0);
    if (used + cost <= limit) {
      if (!commit) return { allowed: true, retryAfterMs: 0, remaining: limit - used };
      events.push({ t: n, cost });
      keys.set(key, events);
      return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
    }
    if (commit) keys.set(key, events);
    const target = used + cost - limit;
    let acc = 0;
    let retry = 0;
    for (const e of events) {
      acc += e.cost;
      if (acc >= target) {
        retry = Math.ceil(e.t + windowMs - n);
        break;
      }
    }
    return { allowed: false, retryAfterMs: retry, remaining: limit - used };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset: (key) => keys.delete(key),
    sweep() {
      const n = now();
      let removed = 0;
      for (const [k, ev] of [...keys]) {
        const l = live(ev, n);
        if (l.length === 0) {
          keys.delete(k);
          removed++;
        } else keys.set(k, l);
      }
      return removed;
    },
    size: () => keys.size,
  };
}
