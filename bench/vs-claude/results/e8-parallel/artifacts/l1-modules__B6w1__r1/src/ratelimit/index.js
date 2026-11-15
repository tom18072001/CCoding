// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now/setTimeout.

function rlError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

const isPosInt = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1;

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw rlError('RL_INVALID_KEY');
}

function checkCost(cost, capacity) {
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw rlError('RL_INVALID_COST');
  if (cost > capacity) throw rlError('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

function checkOptions(options, fields) {
  if (options === null || options === undefined || typeof options !== 'object') {
    throw rlError('RL_INVALID_OPTIONS');
  }
  for (const f of fields) {
    if (!isPosInt(options[f])) throw rlError('RL_INVALID_OPTIONS');
  }
  if (typeof options.now !== 'function') throw rlError('RL_INVALID_OPTIONS');
}

export function createTokenBucket(options) {
  checkOptions(options, ['capacity']);
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const interval = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!isPosInt(refillAmount) || !isPosInt(interval)) throw rlError('RL_INVALID_OPTIONS');

  // Số token được nhân với `interval` để tính toán bằng số nguyên.
  const max = capacity * interval;
  const keys = new Map(); // key -> { tokens, last }

  function current(key, t) {
    const s = keys.get(key);
    if (!s) return { tokens: max, last: t, exists: false };
    const elapsed = t > s.last ? t - s.last : 0;
    const tokens = Math.min(max, s.tokens + elapsed * refillAmount);
    return { tokens, last: t > s.last ? t : s.last, exists: true };
  }

  function evaluate(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, capacity);
    const t = now();
    const st = current(key, t);
    const need = cost * interval;
    if (st.tokens >= need) {
      const after = commit ? st.tokens - need : st.tokens;
      if (commit) keys.set(key, { tokens: after, last: st.last });
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(after / interval) };
    }
    if (commit && st.exists) keys.set(key, { tokens: st.tokens, last: st.last });
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - st.tokens) / refillAmount),
      remaining: Math.floor(st.tokens / interval),
    };
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const key of [...keys.keys()]) {
        if (current(key, t).tokens >= max) {
          keys.delete(key);
          n++;
        }
      }
      return n;
    },
    size: () => keys.size,
  };
}

export function createSlidingWindow(options) {
  checkOptions(options, ['limit', 'windowMs']);
  const { limit, windowMs, now } = options;
  const keys = new Map(); // key -> [{ t, cost }]

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function evaluate(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, limit);
    const t = now();
    const had = keys.get(key);
    const events = had ? live(had, t) : [];
    if (had) keys.set(key, events);
    const used = events.reduce((a, e) => a + e.cost, 0);
    if (used + cost <= limit) {
      if (commit) {
        events.push({ t, cost });
        keys.set(key, events);
        return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
    const target = used + cost - limit;
    let acc = 0;
    let retryAfterMs = 0;
    for (const e of events) {
      acc += e.cost;
      if (acc >= target) {
        retryAfterMs = Math.ceil(e.t + windowMs - t);
        break;
      }
    }
    return { allowed: false, retryAfterMs, remaining: limit - used };
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [key, events] of [...keys]) {
        const l = live(events, t);
        if (l.length === 0) {
          keys.delete(key);
          n++;
        } else keys.set(key, l);
      }
      return n;
    },
    size: () => keys.size,
  };
}
