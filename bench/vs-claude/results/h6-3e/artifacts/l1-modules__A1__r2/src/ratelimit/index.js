// ratelimit — xem SPEC.md, mục "Module ratelimit". Đồng hồ chỉ đến từ options.now.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function posInt(v) {
  return Number.isInteger(v) && v >= 1;
}

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
}

function checkCost(cost, capacity) {
  if (cost === undefined) cost = 1;
  if (!posInt(cost)) throw err('RL_INVALID_COST');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

function requireNow(options) {
  if (options === null || typeof options !== 'object' || typeof options.now !== 'function') {
    throw err('RL_INVALID_OPTIONS');
  }
}

export function createTokenBucket(options) {
  requireNow(options);
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const refillIntervalMs = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  const { capacity, now } = options;
  if (!posInt(capacity) || !posInt(refillAmount) || !posInt(refillIntervalMs)) throw err('RL_INVALID_OPTIONS');

  // Mọi lượng token được nhân với interval để tính toán số nguyên chính xác.
  const interval = BigInt(refillIntervalMs);
  const amount = BigInt(refillAmount);
  const full = BigInt(capacity) * interval;
  const buckets = new Map(); // key → { scaled: BigInt, last: number }

  const readNow = () => Math.floor(now());

  // Trạng thái đã nạp bù tại thời điểm t (không sửa state gốc).
  function refilled(state, t) {
    if (t <= state.last) return { scaled: state.scaled, last: state.last };
    let scaled = state.scaled + BigInt(t - state.last) * amount;
    if (scaled > full) scaled = full;
    return { scaled, last: t };
  }

  function evaluate(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, capacity);
    const t = readNow();
    const existing = buckets.get(key);
    const state = existing ? refilled(existing, t) : { scaled: full, last: t };
    const need = BigInt(cost) * interval;
    const allowed = state.scaled >= need;
    let retryAfterMs = 0;
    if (!allowed) {
      const diff = need - state.scaled;
      retryAfterMs = Number((diff + amount - 1n) / amount);
    }
    if (commit) {
      if (allowed) state.scaled -= need;
      buckets.set(key, state);
    }
    return { allowed, retryAfterMs, remaining: Number(state.scaled / interval) };
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset(key) {
      checkKey(key);
      return buckets.delete(key);
    },
    sweep() {
      const t = readNow();
      let removed = 0;
      for (const [key, state] of [...buckets]) {
        if (refilled(state, t).scaled >= full) {
          buckets.delete(key);
          removed++;
        }
      }
      return removed;
    },
    size: () => buckets.size,
  };
}

export function createSlidingWindow(options) {
  requireNow(options);
  const { limit, windowMs, now } = options;
  if (!posInt(limit) || !posInt(windowMs)) throw err('RL_INVALID_OPTIONS');

  const keys = new Map(); // key → [{ t, cost }]

  function prune(events, t) {
    const live = events.filter((e) => e.t > t - windowMs);
    if (live.length !== events.length) {
      events.length = 0;
      events.push(...live);
    }
    return events;
  }

  function evaluate(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, limit);
    const t = now();
    let events = keys.get(key);
    if (events) prune(events, t);
    else events = [];
    let used = 0;
    for (const e of events) used += e.cost;
    if (used + cost <= limit) {
      if (!commit) return { allowed: true, retryAfterMs: 0, remaining: limit - used };
      events.push({ t, cost });
      keys.set(key, events);
      return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
    }
    const need = used + cost - limit;
    let acc = 0;
    let retryAfterMs = 0;
    for (const e of events) {
      acc += e.cost;
      if (acc >= need) {
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
      let removed = 0;
      for (const [key, events] of [...keys]) {
        prune(events, t);
        if (events.length === 0) {
          keys.delete(key);
          removed++;
        }
      }
      return removed;
    },
    size: () => keys.size,
  };
}
