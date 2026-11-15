// Module ratelimit — token bucket và cửa sổ trượt. Xem SPEC.md.
// Đồng hồ chỉ đến từ options.now.

function fail(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function posInt(v) {
  return Number.isSafeInteger(v) && v >= 1;
}

function checkRequest(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw fail('RL_INVALID_KEY');
  if (cost === undefined) cost = 1;
  if (!posInt(cost)) throw fail('RL_INVALID_COST');
  if (cost > capacity) throw fail('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

function readClock(now) {
  const t = now();
  if (typeof t !== 'number' || Number.isNaN(t)) throw fail('RL_INVALID_OPTIONS');
  return t;
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') throw fail('RL_INVALID_OPTIONS');
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const interval = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!posInt(capacity) || !posInt(refillAmount) || !posInt(interval) || typeof now !== 'function') {
    throw fail('RL_INVALID_OPTIONS');
  }
  // Token được nhân với `interval` để mọi phép tính là số nguyên (BigInt).
  const I = BigInt(interval);
  const A = BigInt(refillAmount);
  const CAP = BigInt(capacity) * I;
  const keys = new Map(); // key -> { tokens, last }

  const refilled = (st, t) => {
    if (t <= st.last) return { tokens: st.tokens, last: st.last };
    const tokens = st.tokens + BigInt(t - st.last) * A;
    return { tokens: tokens > CAP ? CAP : tokens, last: t };
  };

  const evaluate = (key, cost, commit) => {
    cost = checkRequest(key, cost, capacity);
    const t = Math.floor(readClock(now));
    const existing = keys.get(key);
    const st = refilled(existing || { tokens: CAP, last: t }, t);
    const need = BigInt(cost) * I;
    let res;
    if (st.tokens >= need) {
      const after = commit ? st.tokens - need : st.tokens;
      res = { allowed: true, retryAfterMs: 0, remaining: Number((commit ? after : st.tokens) / I) };
      st.tokens = after;
    } else {
      const lack = need - st.tokens;
      res = {
        allowed: false,
        retryAfterMs: Number((lack + A - 1n) / A),
        remaining: Number(st.tokens / I),
      };
    }
    if (commit) keys.set(key, st);
    return res;
  };

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset: (key) => keys.delete(key),
    sweep() {
      const t = Math.floor(readClock(now));
      let n = 0;
      for (const [k, st] of keys) {
        if (refilled(st, t).tokens >= CAP) {
          keys.delete(k);
          n++;
        }
      }
      return n;
    },
    size: () => keys.size,
  };
}

export function createSlidingWindow(options) {
  if (options === null || typeof options !== 'object') throw fail('RL_INVALID_OPTIONS');
  const { limit, windowMs, now } = options;
  if (!posInt(limit) || !posInt(windowMs) || typeof now !== 'function') {
    throw fail('RL_INVALID_OPTIONS');
  }
  const keys = new Map(); // key -> [{ t, cost }]

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  const evaluate = (key, cost, commit) => {
    cost = checkRequest(key, cost, limit);
    const t = readClock(now);
    const events = live(keys.get(key) || [], t);
    if (keys.has(key)) keys.set(key, events);
    const used = events.reduce((s, e) => s + e.cost, 0);
    if (used + cost <= limit) {
      if (commit) {
        events.push({ t, cost });
        keys.set(key, events);
        return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
    const need = used + cost - limit;
    let acc = 0;
    let retry = 0;
    for (const e of events) {
      acc += e.cost;
      if (acc >= need) {
        retry = Math.ceil(e.t + windowMs - t);
        break;
      }
    }
    return { allowed: false, retryAfterMs: retry, remaining: limit - used };
  };

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset: (key) => keys.delete(key),
    sweep() {
      const t = readClock(now);
      let n = 0;
      for (const [k, events] of keys) {
        const alive = live(events, t);
        if (alive.length === 0) {
          keys.delete(k);
          n++;
        } else keys.set(k, alive);
      }
      return n;
    },
    size: () => keys.size,
  };
}
