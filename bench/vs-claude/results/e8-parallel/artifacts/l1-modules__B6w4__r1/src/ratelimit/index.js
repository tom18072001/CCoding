// Module ratelimit — token bucket và cửa sổ trượt, đồng hồ tiêm qua options.now.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

const isPosInt = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1;

function checkKeyCost(key, cost, max) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw err('RL_INVALID_COST');
  if (cost > max) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

function checkOptions(options, names, defaults) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const out = {};
  for (const n of names) {
    const v = options[n] === undefined && n in defaults ? defaults[n] : options[n];
    if (!isPosInt(v)) throw err('RL_INVALID_OPTIONS');
    out[n] = v;
  }
  if (typeof options.now !== 'function') throw err('RL_INVALID_OPTIONS');
  out.now = options.now;
  return out;
}

export function createTokenBucket(options) {
  const { capacity, refillAmount, refillIntervalMs, now } = checkOptions(
    options,
    ['capacity', 'refillAmount', 'refillIntervalMs'],
    { refillAmount: 1, refillIntervalMs: 1000 },
  );
  // Đơn vị nội bộ: token * refillIntervalMs (số nguyên); mỗi ms nạp refillAmount đơn vị.
  const scale = refillIntervalMs;
  const maxLevel = capacity * scale;
  const keys = new Map(); // key -> { level, last }

  function current(state, t) {
    if (!state) return { level: maxLevel, last: t };
    const dt = t > state.last ? t - state.last : 0;
    const level = Math.min(maxLevel, state.level + dt * refillAmount);
    return { level, last: t > state.last ? t : state.last };
  }

  function attempt(key, cost, commit) {
    cost = checkKeyCost(key, cost, capacity);
    const t = now();
    const s = current(keys.get(key), t);
    const need = cost * scale;
    if (s.level >= need) {
      if (commit) {
        s.level -= need;
        keys.set(key, s);
      }
      return {
        allowed: true,
        retryAfterMs: 0,
        remaining: Math.floor(s.level / scale),
      };
    }
    if (commit) keys.set(key, s);
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - s.level) / refillAmount),
      remaining: Math.floor(s.level / scale),
    };
  }

  return {
    take(key, cost) {
      return attempt(key, cost, true);
    },
    peek(key, cost) {
      return attempt(key, cost, false);
    },
    reset(key) {
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of keys) {
        if (current(st, t).level >= maxLevel) {
          keys.delete(k);
          n++;
        }
      }
      return n;
    },
    size() {
      return keys.size;
    },
  };
}

export function createSlidingWindow(options) {
  const { limit, windowMs, now } = checkOptions(options, ['limit', 'windowMs'], {});
  const keys = new Map(); // key -> [{t, cost}]

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function attempt(key, cost, commit) {
    cost = checkKeyCost(key, cost, limit);
    const t = now();
    const events = live(keys.get(key) || [], t);
    const used = events.reduce((a, e) => a + e.cost, 0);
    if (used + cost <= limit) {
      if (commit) {
        events.push({ t, cost });
        keys.set(key, events);
        return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
    if (commit && keys.has(key)) keys.set(key, events);
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
    take(key, cost) {
      return attempt(key, cost, true);
    },
    peek(key, cost) {
      return attempt(key, cost, false);
    },
    reset(key) {
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, ev] of keys) {
        const l = live(ev, t);
        if (l.length === 0) {
          keys.delete(k);
          n++;
        } else keys.set(k, l);
      }
      return n;
    },
    size() {
      return keys.size;
    },
  };
}
