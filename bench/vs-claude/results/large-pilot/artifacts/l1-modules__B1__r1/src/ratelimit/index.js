// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.

function fail(code, message) {
  const err = new Error(message ?? code);
  err.code = code;
  return err;
}

const isPosInt = (v) => Number.isSafeInteger(v) && v >= 1;

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw fail('RL_INVALID_KEY');
}

function checkCost(cost, max) {
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw fail('RL_INVALID_COST');
  if (cost > max) throw fail('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

function readOptions(options, names) {
  if (options === null || typeof options !== 'object') throw fail('RL_INVALID_OPTIONS');
  if (typeof options.now !== 'function') throw fail('RL_INVALID_OPTIONS');
  for (const n of names) {
    if (!isPosInt(options[n])) throw fail('RL_INVALID_OPTIONS');
  }
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') throw fail('RL_INVALID_OPTIONS');
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const refillIntervalMs = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  readOptions({ capacity, refillAmount, refillIntervalMs, now }, ['capacity', 'refillAmount', 'refillIntervalMs']);

  // Token được lưu dạng số nguyên đã nhân với refillIntervalMs để tránh số thực.
  const full = capacity * refillIntervalMs;
  const keys = new Map(); // key -> { tokens, last }

  // Trạng thái hiện tại của khóa tại thời điểm t (không ghi vào map).
  function project(key, t) {
    const st = keys.get(key);
    if (!st) return { tokens: full, last: t };
    const dt = t > st.last ? t - st.last : 0;
    const tokens = Math.min(full, st.tokens + dt * refillAmount);
    return { tokens, last: t > st.last ? t : st.last };
  }

  function evaluate(key, cost, t, tokens) {
    const need = cost * refillIntervalMs;
    if (tokens >= need) {
      return { allowed: true, retryAfterMs: 0, left: tokens - need };
    }
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - tokens) / refillAmount),
      left: tokens,
    };
  }

  return {
    take(key, cost) {
      checkKey(key);
      cost = checkCost(cost, capacity);
      const t = now();
      const cur = project(key, t);
      const r = evaluate(key, cost, t, cur.tokens);
      keys.set(key, { tokens: r.left, last: cur.last });
      return {
        allowed: r.allowed,
        retryAfterMs: r.retryAfterMs,
        remaining: Math.floor(r.left / refillIntervalMs),
      };
    },
    peek(key, cost) {
      checkKey(key);
      cost = checkCost(cost, capacity);
      const cur = project(key, now());
      const r = evaluate(key, cost, now(), cur.tokens);
      return {
        allowed: r.allowed,
        retryAfterMs: r.retryAfterMs,
        remaining: Math.floor(cur.tokens / refillIntervalMs),
      };
    },
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let removed = 0;
      for (const key of [...keys.keys()]) {
        if (project(key, t).tokens >= full) {
          keys.delete(key);
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
  readOptions(options, ['limit', 'windowMs']);
  const { limit, windowMs, now } = options;
  const keys = new Map(); // key -> [{ t, cost }] theo thứ tự cũ → mới

  function live(events, t) {
    let i = 0;
    while (i < events.length && events[i].t <= t - windowMs) i++;
    return i === 0 ? events : events.slice(i);
  }

  function evaluate(events, cost, t) {
    let used = 0;
    for (const e of events) used += e.cost;
    if (used + cost <= limit) {
      return { allowed: true, retryAfterMs: 0, used };
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
    return { allowed: false, retryAfterMs, used };
  }

  return {
    take(key, cost) {
      checkKey(key);
      cost = checkCost(cost, limit);
      const t = now();
      const events = live(keys.get(key) ?? [], t);
      const r = evaluate(events, cost, t);
      if (r.allowed) {
        events.push({ t, cost });
        keys.set(key, events);
        return { allowed: true, retryAfterMs: 0, remaining: limit - r.used - cost };
      }
      keys.set(key, events);
      return { allowed: false, retryAfterMs: r.retryAfterMs, remaining: limit - r.used };
    },
    peek(key, cost) {
      checkKey(key);
      cost = checkCost(cost, limit);
      const t = now();
      const events = live(keys.get(key) ?? [], t);
      const r = evaluate(events, cost, t);
      return { allowed: r.allowed, retryAfterMs: r.retryAfterMs, remaining: limit - r.used };
    },
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let removed = 0;
      for (const [key, events] of [...keys]) {
        const alive = live(events, t);
        if (alive.length === 0) {
          keys.delete(key);
          removed++;
        } else {
          keys.set(key, alive);
        }
      }
      return removed;
    },
    size() {
      return keys.size;
    },
  };
}
