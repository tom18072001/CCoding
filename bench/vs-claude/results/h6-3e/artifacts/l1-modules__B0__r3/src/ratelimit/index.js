// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isSafeInteger(v) && v >= 1;

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
}

function checkCost(cost, max) {
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw err('RL_INVALID_COST');
  if (cost > max) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

function readOptions(options) {
  if (options === null || typeof options !== 'object' || typeof options.now !== 'function') {
    throw err('RL_INVALID_OPTIONS');
  }
  return options;
}

export function createTokenBucket(options) {
  const o = readOptions(options);
  const capacity = o.capacity;
  const refillAmount = o.refillAmount === undefined ? 1 : o.refillAmount;
  const interval = o.refillIntervalMs === undefined ? 1000 : o.refillIntervalMs;
  if (!isPosInt(capacity) || !isPosInt(refillAmount) || !isPosInt(interval)) throw err('RL_INVALID_OPTIONS');
  const now = o.now;
  const capScaled = capacity * interval; // token nhân refillIntervalMs: số nguyên chính xác
  const keys = new Map(); // key -> { tokens (scaled), last }

  // Trạng thái sau khi nạp bù tại thời điểm t (không đổi dữ liệu lưu)
  function view(state, t) {
    if (!state) return { tokens: capScaled, last: t };
    if (t <= state.last) return { tokens: state.tokens, last: state.last };
    return { tokens: Math.min(capScaled, state.tokens + (t - state.last) * refillAmount), last: t };
  }

  function run(key, cost, consume) {
    checkKey(key);
    cost = checkCost(cost, capacity);
    const t = now();
    const v = view(keys.get(key), t);
    const need = cost * interval;
    if (v.tokens >= need) {
      if (consume) {
        v.tokens -= need;
        keys.set(key, v);
        return { allowed: true, retryAfterMs: 0, remaining: Math.floor(v.tokens / interval) };
      }
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(v.tokens / interval) };
    }
    if (consume) keys.set(key, v);
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - v.tokens) / refillAmount),
      remaining: Math.floor(v.tokens / interval),
    };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, s] of [...keys]) {
        if (view(s, t).tokens >= capScaled) {
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
  const o = readOptions(options);
  const { limit, windowMs, now } = o;
  if (!isPosInt(limit) || !isPosInt(windowMs)) throw err('RL_INVALID_OPTIONS');
  const keys = new Map(); // key -> [{ t, cost }]

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function run(key, cost, consume) {
    checkKey(key);
    cost = checkCost(cost, limit);
    const t = now();
    const events = live(keys.get(key) || [], t);
    if (consume && keys.has(key)) keys.set(key, events);
    const used = events.reduce((s, e) => s + e.cost, 0);
    if (used + cost <= limit) {
      if (consume) {
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
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, ev] of [...keys]) {
        const l = live(ev, t);
        if (l.length === 0) {
          keys.delete(k);
          n++;
        } else keys.set(k, l);
      }
      return n;
    },
    size: () => keys.size,
  };
}
