// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.

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

function checkCost(cost, capacity) {
  if (cost === undefined) cost = 1;
  if (!posInt(cost)) throw err('RL_INVALID_COST');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const refillIntervalMs = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!posInt(capacity) || !posInt(refillAmount) || !posInt(refillIntervalMs) || typeof now !== 'function') {
    throw err('RL_INVALID_OPTIONS');
  }
  const I = refillIntervalMs;
  const full = capacity * I; // token được nhân với refillIntervalMs để dùng số nguyên
  const keys = new Map(); // key -> { scaled, last }

  // trạng thái sau khi nạp bù tới thời điểm t (không ghi vào map)
  function view(key, t) {
    const st = keys.get(key);
    if (!st) return { scaled: full, last: t };
    const elapsed = t - st.last;
    if (!(elapsed > 0)) return { scaled: st.scaled, last: st.last };
    let scaled;
    if (elapsed >= Math.ceil((full - st.scaled) / refillAmount)) scaled = full;
    else scaled = Math.min(full, st.scaled + elapsed * refillAmount);
    return { scaled, last: t };
  }

  function evaluate(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, capacity);
    const t = now();
    const st = view(key, t);
    const need = cost * I;
    let result;
    if (st.scaled >= need) {
      const after = commit ? st.scaled - need : st.scaled;
      result = { allowed: true, retryAfterMs: 0, remaining: Math.floor((commit ? after : st.scaled) / I) };
      if (commit) st.scaled = after;
    } else {
      result = {
        allowed: false,
        retryAfterMs: Math.ceil((need - st.scaled) / refillAmount),
        remaining: Math.floor(st.scaled / I),
      };
    }
    if (commit) keys.set(key, st);
    return result;
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
        if (view(key, t).scaled >= full) {
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
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const { limit, windowMs, now } = options;
  if (!posInt(limit) || !posInt(windowMs) || typeof now !== 'function') throw err('RL_INVALID_OPTIONS');
  const keys = new Map(); // key -> [{ t, cost }]

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function evaluate(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, limit);
    const t = now();
    const events = live(keys.get(key) || [], t);
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
    if (commit) keys.set(key, events);
    return { allowed: false, retryAfterMs: retry, remaining: limit - used };
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
      for (const [key, events] of [...keys.entries()]) {
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
