// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ options.now; không dùng Date.now / setTimeout / setInterval.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const isPosInt = (x) => Number.isSafeInteger(x) && x >= 1;

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
}

function checkCost(cost, capacity) {
  const c = cost === undefined ? 1 : cost;
  if (!isPosInt(c)) throw err('RL_INVALID_COST');
  if (c > capacity) throw err('RL_COST_EXCEEDS_CAPACITY');
  return c;
}

function readNow(now) {
  const v = now();
  return BigInt(Math.floor(Number(v)));
}

function checkOptions(options) {
  if (options === null || typeof options !== 'object' || typeof options.now !== 'function') {
    throw err('RL_INVALID_OPTIONS');
  }
}

export function createTokenBucket(options) {
  checkOptions(options);
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const refillIntervalMs = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!isPosInt(capacity) || !isPosInt(refillAmount) || !isPosInt(refillIntervalMs)) {
    throw err('RL_INVALID_OPTIONS');
  }

  // Token được nhân với refillIntervalMs để dùng số nguyên: 1 token = I đơn vị.
  const I = BigInt(refillIntervalMs);
  const A = BigInt(refillAmount);
  const FULL = BigInt(capacity) * I;
  const keys = new Map(); // key -> { tokens, last }

  function refill(st, t) {
    if (t > st.last) {
      const sum = st.tokens + (t - st.last) * A;
      st.tokens = sum > FULL ? FULL : sum;
      st.last = t;
    }
  }

  function result(st, cost, commit) {
    const need = BigInt(cost) * I;
    if (st.tokens >= need) {
      if (commit) st.tokens -= need;
      return { allowed: true, retryAfterMs: 0, remaining: Number(commit ? st.tokens / I : st.tokens / I) };
    }
    const lack = need - st.tokens;
    const retry = (lack + A - 1n) / A;
    return { allowed: false, retryAfterMs: Number(retry), remaining: Number(st.tokens / I) };
  }

  return {
    take(key, cost) {
      checkKey(key);
      const c = checkCost(cost, capacity);
      const t = readNow(now);
      let st = keys.get(key);
      if (!st) {
        st = { tokens: FULL, last: t };
        keys.set(key, st);
      } else {
        refill(st, t);
      }
      return result(st, c, true);
    },
    peek(key, cost) {
      checkKey(key);
      const c = checkCost(cost, capacity);
      const t = readNow(now);
      const cur = keys.get(key);
      const st = cur ? { tokens: cur.tokens, last: cur.last } : { tokens: FULL, last: t };
      if (cur) refill(st, t);
      return result(st, c, false);
    },
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = readNow(now);
      let removed = 0;
      for (const [k, st] of keys) {
        refill(st, t);
        if (st.tokens >= FULL) {
          keys.delete(k);
          removed++;
        }
      }
      return removed;
    },
    size() {
      return keys.size;
    },
  };
}

export function createSlidingWindow(options) {
  checkOptions(options);
  const { limit, windowMs, now } = options;
  if (!isPosInt(limit) || !isPosInt(windowMs)) throw err('RL_INVALID_OPTIONS');

  const W = BigInt(windowMs);
  const keys = new Map(); // key -> [{ t, cost }]

  function prune(events, t) {
    let i = 0;
    while (i < events.length && events[i].t <= t - W) i++;
    if (i > 0) events.splice(0, i);
  }

  const usedOf = (events) => events.reduce((s, e) => s + e.cost, 0);

  function evaluate(events, cost, t, commit) {
    const used = usedOf(events);
    if (used + cost <= limit) {
      if (commit) events.push({ t, cost });
      return { allowed: true, retryAfterMs: 0, remaining: limit - used - (commit ? cost : 0) };
    }
    const need = used + cost - limit;
    let acc = 0;
    let retry = 0n;
    for (const e of events) {
      acc += e.cost;
      if (acc >= need) {
        retry = e.t + W - t;
        break;
      }
    }
    return { allowed: false, retryAfterMs: Number(retry), remaining: limit - used };
  }

  return {
    take(key, cost) {
      checkKey(key);
      const c = checkCost(cost, limit);
      const t = readNow(now);
      let events = keys.get(key);
      if (!events) {
        events = [];
        keys.set(key, events);
      } else {
        prune(events, t);
      }
      return evaluate(events, c, t, true);
    },
    peek(key, cost) {
      checkKey(key);
      const c = checkCost(cost, limit);
      const t = readNow(now);
      const events = keys.get(key);
      if (events) prune(events, t);
      return evaluate(events || [], c, t, false);
    },
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = readNow(now);
      let removed = 0;
      for (const [k, events] of keys) {
        prune(events, t);
        if (events.length === 0) {
          keys.delete(k);
          removed++;
        }
      }
      return removed;
    },
    size() {
      return keys.size;
    },
  };
}
