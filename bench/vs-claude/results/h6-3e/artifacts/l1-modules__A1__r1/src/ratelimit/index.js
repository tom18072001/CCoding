// ratelimit — xem SPEC.md, mục "Module ratelimit". Đồng hồ chỉ đến từ options.now.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
}

function checkCost(cost, capacity) {
  const c = cost === undefined ? 1 : cost;
  if (!Number.isSafeInteger(c) || c < 1) throw err('RL_INVALID_COST');
  if (c > capacity) throw err('RL_COST_EXCEEDS_CAPACITY');
  return c;
}

function readOptions(options) {
  if (options === null || typeof options !== 'object' || typeof options.now !== 'function') {
    throw err('RL_INVALID_OPTIONS');
  }
  return options;
}

const posInt = (v) => Number.isSafeInteger(v) && v >= 1;

export function createTokenBucket(options) {
  const o = readOptions(options);
  const refillAmount = o.refillAmount === undefined ? 1 : o.refillAmount;
  const refillIntervalMs = o.refillIntervalMs === undefined ? 1000 : o.refillIntervalMs;
  if (!posInt(o.capacity) || !posInt(refillAmount) || !posInt(refillIntervalMs)) throw err('RL_INVALID_OPTIONS');
  const now = o.now;
  const capacity = o.capacity;

  // Token lưu dạng số nguyên BigInt nhân với refillIntervalMs.
  const I = BigInt(refillIntervalMs);
  const A = BigInt(refillAmount);
  const CAP = BigInt(capacity) * I;
  const keys = new Map();

  const clock = () => BigInt(Math.floor(now()));
  const fresh = (t) => ({ tokens: CAP, last: t });

  // trả trạng thái đã nạp bù tới thời điểm t (không ghi vào map)
  function refilled(st, t) {
    if (t <= st.last) return { tokens: st.tokens, last: st.last };
    let tokens = st.tokens + (t - st.last) * A;
    if (tokens > CAP) tokens = CAP;
    return { tokens, last: t };
  }

  function attempt(key, cost, commit) {
    checkKey(key);
    const c = checkCost(cost, capacity);
    const t = clock();
    const existing = keys.get(key);
    const st = refilled(existing || fresh(t), t);
    const need = BigInt(c) * I;
    const result = { allowed: false, retryAfterMs: 0, remaining: 0 };
    if (st.tokens >= need) {
      result.allowed = true;
      if (commit) st.tokens -= need;
    } else {
      result.retryAfterMs = Number((need - st.tokens + A - 1n) / A);
    }
    // remaining: take = sau thao tác; peek = hiện tại (chưa trừ)
    result.remaining = Number(st.tokens / I);
    if (commit) keys.set(key, st);
    return result;
  }

  return {
    take: (key, cost) => attempt(key, cost, true),
    peek: (key, cost) => attempt(key, cost, false),
    reset: (key) => keys.delete(key),
    sweep() {
      const t = clock();
      let removed = 0;
      for (const [k, st] of keys) {
        if (refilled(st, t).tokens >= CAP) {
          keys.delete(k);
          removed++;
        }
      }
      return removed;
    },
    size: () => keys.size,
  };
}

export function createSlidingWindow(options) {
  const o = readOptions(options);
  if (!posInt(o.limit) || !posInt(o.windowMs)) throw err('RL_INVALID_OPTIONS');
  const { limit, windowMs, now } = o;
  const keys = new Map(); // key -> [{ t, cost }]

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function attempt(key, cost, commit) {
    checkKey(key);
    const c = checkCost(cost, limit);
    const t = now();
    const events = live(keys.get(key) || [], t);
    const used = events.reduce((s, e) => s + e.cost, 0);
    if (used + c <= limit) {
      if (commit) {
        events.push({ t, cost: c });
        keys.set(key, events);
      }
      return { allowed: true, retryAfterMs: 0, remaining: commit ? limit - used - c : limit - used };
    }
    if (commit) keys.set(key, events);
    const needFree = used + c - limit;
    let acc = 0;
    let retry = 0;
    for (const e of events) {
      acc += e.cost;
      if (acc >= needFree) {
        retry = Math.ceil(e.t + windowMs - t);
        break;
      }
    }
    return { allowed: false, retryAfterMs: retry, remaining: limit - used };
  }

  return {
    take: (key, cost) => attempt(key, cost, true),
    peek: (key, cost) => attempt(key, cost, false),
    reset: (key) => keys.delete(key),
    sweep() {
      const t = now();
      let removed = 0;
      for (const [k, events] of keys) {
        const alive = live(events, t);
        if (alive.length === 0) {
          keys.delete(k);
          removed++;
        } else keys.set(k, alive);
      }
      return removed;
    },
    size: () => keys.size,
  };
}
