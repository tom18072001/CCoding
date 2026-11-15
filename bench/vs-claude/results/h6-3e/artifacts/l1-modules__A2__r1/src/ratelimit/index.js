// ratelimit — xem SPEC.md, mục "Module ratelimit". Đồng hồ chỉ đến từ options.now.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function posInt(v) {
  return Number.isSafeInteger(v) && v >= 1;
}

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
}

function checkCost(cost, cap) {
  if (cost === undefined) cost = 1;
  if (!posInt(cost)) throw err('RL_INVALID_COST');
  if (cost > cap) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const interval = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!posInt(capacity) || !posInt(refillAmount) || !posInt(interval) || typeof now !== 'function') {
    throw err('RL_INVALID_OPTIONS');
  }
  const full = capacity * interval; // token nhân với interval để dùng số nguyên
  const keys = new Map(); // key -> { level, last }

  // Trạng thái đã nạp bù đến thời điểm t (không ghi vào map)
  function refilled(st, t) {
    if (t > st.last) {
      return { level: Math.min(full, st.level + (t - st.last) * refillAmount), last: t };
    }
    return { level: st.level, last: st.last };
  }

  function run(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, capacity);
    const t = now();
    const existing = keys.get(key);
    const st = existing ? refilled(existing, t) : { level: full, last: t };
    const need = cost * interval;
    let res;
    if (st.level >= need) {
      const after = commit ? st.level - need : st.level;
      if (commit) st.level = after;
      res = { allowed: true, retryAfterMs: 0, remaining: Math.floor(after / interval) };
    } else {
      res = {
        allowed: false,
        retryAfterMs: Math.ceil((need - st.level) / refillAmount),
        remaining: Math.floor(st.level / interval),
      };
    }
    if (commit) keys.set(key, st);
    return res;
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek(key, cost) {
      const r = run(key, cost, false);
      return r;
    },
    reset(key) {
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of keys) {
        if (refilled(st, t).level >= full) { keys.delete(k); n++; }
      }
      return n;
    },
    size: () => keys.size,
  };
}

export function createSlidingWindow(options) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const { limit, windowMs, now } = options;
  if (!posInt(limit) || !posInt(windowMs) || typeof now !== 'function') throw err('RL_INVALID_OPTIONS');
  const keys = new Map(); // key -> [{ t, cost }]

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function run(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, limit);
    const t = now();
    const events = live(keys.get(key) || [], t);
    const used = events.reduce((s, e) => s + e.cost, 0);
    if (used + cost <= limit) {
      if (commit) {
        events.push({ t, cost });
        keys.set(key, events);
      }
      return { allowed: true, retryAfterMs: 0, remaining: commit ? limit - used - cost : limit - used };
    }
    if (commit && keys.has(key)) keys.set(key, events);
    const need = used + cost - limit;
    let acc = 0;
    let retry = 0;
    for (const e of events) {
      acc += e.cost;
      if (acc >= need) { retry = Math.ceil(e.t + windowMs - t); break; }
    }
    return { allowed: false, retryAfterMs: retry, remaining: limit - used };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset(key) {
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, ev] of keys) {
        const l = live(ev, t);
        if (l.length === 0) { keys.delete(k); n++; }
        else keys.set(k, l);
      }
      return n;
    },
    size: () => keys.size,
  };
}
