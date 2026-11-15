// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now hay timer.

function rlError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function isPosInt(v) {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;
}

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw rlError('RL_INVALID_KEY');
}

// Thứ tự: khóa → cost → cost so với sức chứa.
function checkArgs(key, cost, capacity) {
  checkKey(key);
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw rlError('RL_INVALID_COST');
  if (cost > capacity) throw rlError('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') throw rlError('RL_INVALID_OPTIONS');
  if (typeof options.now !== 'function') throw rlError('RL_INVALID_OPTIONS');
  for (const [name, def] of names) {
    const v = options[name] === undefined ? def : options[name];
    if (!isPosInt(v)) throw rlError('RL_INVALID_OPTIONS');
  }
}

export function createTokenBucket(options) {
  checkOptions(options, [['capacity', undefined], ['refillAmount', 1], ['refillIntervalMs', 1000]]);
  const capacity = options.capacity;
  const amount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const interval = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  const now = options.now;
  // Token được lưu dạng số nguyên nhân với `interval`: mỗi ms nạp `amount` đơn vị.
  const max = capacity * interval;
  const keys = new Map(); // key -> { scaled, last }

  function view(st, t) {
    if (!st) return { scaled: max, last: t };
    if (t > st.last) {
      return { scaled: Math.min(max, st.scaled + (t - st.last) * amount), last: t };
    }
    return { scaled: st.scaled, last: st.last }; // đồng hồ lùi: giữ mốc cũ
  }

  function run(key, cost, commit) {
    cost = checkArgs(key, cost, capacity);
    const existing = keys.get(key);
    const s = view(existing, now());
    const need = cost * interval;
    let res;
    if (s.scaled >= need) {
      if (commit) s.scaled -= need;
      res = { allowed: true, retryAfterMs: 0, remaining: Math.floor(s.scaled / interval) };
    } else {
      res = {
        allowed: false,
        retryAfterMs: Math.ceil((need - s.scaled) / amount),
        remaining: Math.floor(s.scaled / interval),
      };
    }
    if (commit) keys.set(key, s);
    return res;
  }

  return {
    take(key, cost) {
      return run(key, cost, true);
    },
    peek(key, cost) {
      return run(key, cost, false);
    },
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of [...keys]) {
        if (view(st, t).scaled >= max) {
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
  checkOptions(options, [['limit', undefined], ['windowMs', undefined]]);
  const { limit, windowMs, now } = options;
  const keys = new Map(); // key -> [{ t, cost }]

  function alive(events, t) {
    return events.filter((e) => e.t > t - windowMs);
  }

  function run(key, cost, commit) {
    cost = checkArgs(key, cost, limit);
    const t = now();
    const events = alive(keys.get(key) || [], t);
    const used = events.reduce((a, e) => a + e.cost, 0);
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
    let retryAfterMs = 0;
    for (const e of events) {
      acc += e.cost;
      if (acc >= need) {
        retryAfterMs = Math.ceil(e.t + windowMs - t);
        break;
      }
    }
    if (commit && keys.has(key)) keys.set(key, events);
    return { allowed: false, retryAfterMs, remaining: limit - used };
  }

  return {
    take(key, cost) {
      return run(key, cost, true);
    },
    peek(key, cost) {
      return run(key, cost, false);
    },
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, events] of [...keys]) {
        const a = alive(events, t);
        if (a.length === 0) {
          keys.delete(k);
          n++;
        } else {
          keys.set(k, a);
        }
      }
      return n;
    },
    size() {
      return keys.size;
    },
  };
}
