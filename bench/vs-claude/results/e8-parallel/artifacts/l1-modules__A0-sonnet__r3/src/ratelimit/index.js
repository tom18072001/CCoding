// ratelimit — xem SPEC.md, mục "Module ratelimit".
// Đồng hồ chỉ đến từ tùy chọn `now`.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

const posInt = (x) => Number.isSafeInteger(x) && x >= 1;

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
}
function checkCost(cost, capacity) {
  if (cost === undefined) cost = 1;
  if (!Number.isSafeInteger(cost) || cost < 1) throw err('RL_INVALID_COST');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}
function needOptions(o) {
  if (o === null || typeof o !== 'object' || typeof o.now !== 'function') throw err('RL_INVALID_OPTIONS');
}

export function createTokenBucket(options) {
  needOptions(options);
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const interval = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!posInt(capacity) || !posInt(refillAmount) || !posInt(interval)) throw err('RL_INVALID_OPTIONS');

  // Token tính theo đơn vị 1/interval token: mỗi ms nạp `refillAmount` đơn vị.
  const cap = capacity * interval;
  const fullAfter = Math.ceil(cap / refillAmount);
  const keys = new Map(); // key -> { tokens, last }

  // trạng thái sau khi nạp bù tới thời điểm t (không ghi vào map)
  const refilled = (st, t) => {
    if (!st) return { tokens: cap, last: t };
    if (t <= st.last) return { tokens: st.tokens, last: st.last };
    const elapsed = t - st.last;
    const tokens = elapsed >= fullAfter ? cap : Math.min(cap, st.tokens + elapsed * refillAmount);
    return { tokens, last: t };
  };

  const run = (key, cost, commit) => {
    checkKey(key);
    cost = checkCost(cost, capacity);
    const st = refilled(keys.get(key), now());
    const need = cost * interval;
    if (st.tokens >= need) {
      const left = commit ? st.tokens - need : st.tokens;
      if (commit) keys.set(key, { tokens: left, last: st.last });
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(left / interval) };
    }
    if (commit) keys.set(key, st);
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - st.tokens) / refillAmount),
      remaining: Math.floor(st.tokens / interval),
    };
  };

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
      for (const [k, st] of [...keys]) {
        if (refilled(st, t).tokens >= cap) { keys.delete(k); n++; }
      }
      return n;
    },
    size: () => keys.size,
  };
}

export function createSlidingWindow(options) {
  needOptions(options);
  const { limit, windowMs, now } = options;
  if (!posInt(limit) || !posInt(windowMs)) throw err('RL_INVALID_OPTIONS');
  const keys = new Map(); // key -> [{ t, cost }]

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  const run = (key, cost, commit) => {
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
    if (commit) keys.set(key, events);
    const need = used + cost - limit;
    let acc = 0;
    let retry = 0;
    for (const e of events) {
      acc += e.cost;
      if (acc >= need) { retry = Math.ceil(e.t + windowMs - t); break; }
    }
    return { allowed: false, retryAfterMs: retry, remaining: limit - used };
  };

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
      for (const [k, events] of [...keys]) {
        const l = live(events, t);
        if (l.length === 0) { keys.delete(k); n++; } else keys.set(k, l);
      }
      return n;
    },
    size: () => keys.size,
  };
}
