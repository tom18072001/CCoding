// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ options.now. Không dùng Date.now / setTimeout / setInterval.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function posInt(x) {
  return typeof x === 'number' && Number.isSafeInteger(x) && x >= 1;
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

function readClock(now) {
  const t = now();
  if (typeof t !== 'number' || !Number.isFinite(t)) throw err('RL_INVALID_OPTIONS', 'now() phải trả số hữu hạn');
  return t;
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const refillIntervalMs = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!posInt(capacity) || !posInt(refillAmount) || !posInt(refillIntervalMs) || typeof now !== 'function') {
    throw err('RL_INVALID_OPTIONS');
  }
  // Mọi lượng token được nhân với refillIntervalMs (BigInt) để chính xác.
  const I = BigInt(refillIntervalMs);
  const R = BigInt(refillAmount);
  const FULL = BigInt(capacity) * I;
  const keys = new Map(); // key -> { s: BigInt, last: number }

  // Trạng thái đã nạp bù đến thời điểm t (không ghi vào map).
  function refilled(st, t) {
    if (t <= st.last) return { s: st.s, last: st.last };
    let s = st.s + BigInt(t - st.last) * R;
    if (s > FULL) s = FULL;
    return { s, last: t };
  }

  function evaluate(st, cost) {
    const need = BigInt(cost) * I;
    if (st.s >= need) {
      return { allowed: true, retryAfterMs: 0, remaining: Number((st.s - need) / I), after: st.s - need };
    }
    const deficit = need - st.s;
    return {
      allowed: false,
      retryAfterMs: Number((deficit + R - 1n) / R),
      remaining: Number(st.s / I),
      after: st.s,
    };
  }

  function view(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, capacity);
    const t = Math.floor(readClock(now));
    const cur = keys.get(key);
    const st = cur ? refilled(cur, t) : { s: FULL, last: t };
    const r = evaluate(st, cost);
    if (commit) keys.set(key, { s: r.after, last: st.last });
    // peek: remaining là số còn lại hiện tại (chưa trừ cost)
    const remaining = commit ? r.remaining : Number(st.s / I);
    return { allowed: r.allowed, retryAfterMs: r.retryAfterMs, remaining };
  }

  return {
    take: (key, cost) => view(key, cost, true),
    peek: (key, cost) => view(key, cost, false),
    reset: (key) => {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = Math.floor(readClock(now));
      let removed = 0;
      for (const [k, st] of [...keys]) {
        if (refilled(st, t).s >= FULL) {
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
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const { limit, windowMs, now } = options;
  if (!posInt(limit) || !posInt(windowMs) || typeof now !== 'function') throw err('RL_INVALID_OPTIONS');
  const keys = new Map(); // key -> [{ t, cost }]

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);
  const sum = (events) => events.reduce((a, e) => a + e.cost, 0);

  function run(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, limit);
    const t = readClock(now);
    const existing = keys.get(key);
    const events = live(existing || [], t);
    const used = sum(events);
    if (used + cost <= limit) {
      if (commit) {
        events.push({ t, cost });
        keys.set(key, events);
      }
      return { allowed: true, retryAfterMs: 0, remaining: commit ? limit - used - cost : limit - used };
    }
    if (commit) keys.set(key, events);
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
    reset: (key) => {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = readClock(now);
      let removed = 0;
      for (const [k, events] of [...keys]) {
        const l = live(events, t);
        if (l.length === 0) {
          keys.delete(k);
          removed++;
        } else keys.set(k, l);
      }
      return removed;
    },
    size: () => keys.size,
  };
}
