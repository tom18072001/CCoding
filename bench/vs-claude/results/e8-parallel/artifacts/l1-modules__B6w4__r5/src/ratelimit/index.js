// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

const isPosInt = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1;

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
}

function checkCost(cost, capacity) {
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw err('RL_INVALID_COST');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const refillIntervalMs = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!isPosInt(capacity) || !isPosInt(refillAmount) || !isPosInt(refillIntervalMs) || typeof now !== 'function') {
    throw err('RL_INVALID_OPTIONS');
  }
  const I = refillIntervalMs;
  const A = refillAmount;
  const maxScaled = capacity * I;
  // state: { s: số token * I (số nguyên), t: mốc cập nhật }
  const keys = new Map();

  // Trạng thái đã nạp bù tới thời điểm n (không ghi vào map).
  function refilled(st, n) {
    if (!st) return { s: maxScaled, t: n };
    if (n <= st.t) return { s: st.s, t: st.t };
    return { s: Math.min(maxScaled, st.s + (n - st.t) * A), t: n };
  }

  function run(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, capacity);
    const n = now();
    const cur = refilled(keys.get(key), n);
    const need = cost * I;
    if (cur.s >= need) {
      if (commit) {
        cur.s -= need;
        keys.set(key, cur);
        return { allowed: true, retryAfterMs: 0, remaining: Math.floor(cur.s / I) };
      }
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(cur.s / I) };
    }
    if (commit) keys.set(key, cur);
    return { allowed: false, retryAfterMs: Math.ceil((need - cur.s) / A), remaining: Math.floor(cur.s / I) };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const n = now();
      let removed = 0;
      for (const [k, st] of [...keys]) {
        if (refilled(st, n).s >= maxScaled) {
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
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const { limit, windowMs, now } = options;
  if (!isPosInt(limit) || !isPosInt(windowMs) || typeof now !== 'function') throw err('RL_INVALID_OPTIONS');
  const keys = new Map(); // key -> [{ t, cost }]

  const live = (events, n) => events.filter((e) => e.t > n - windowMs);

  function run(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, limit);
    const n = now();
    const events = live(keys.get(key) || [], n);
    const used = events.reduce((a, e) => a + e.cost, 0);
    if (used + cost <= limit) {
      if (commit) {
        events.push({ t: n, cost });
        keys.set(key, events);
        return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
    if (commit) keys.set(key, events);
    const target = used + cost - limit;
    let acc = 0;
    let last = events[0];
    for (const e of events) {
      acc += e.cost;
      last = e;
      if (acc >= target) break;
    }
    return { allowed: false, retryAfterMs: Math.ceil(last.t + windowMs - n), remaining: limit - used };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const n = now();
      let removed = 0;
      for (const [k, events] of [...keys]) {
        const l = live(events, n);
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
