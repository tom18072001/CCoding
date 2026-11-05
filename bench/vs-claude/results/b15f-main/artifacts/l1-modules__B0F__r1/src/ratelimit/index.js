// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ options.now; không dùng Date.now / setTimeout / setInterval.

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isInteger(v) && v >= 1;

function checkKey(key) {
  if (typeof key !== 'string' || key === '') {
    throw fail('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
  }
}

function checkCost(cost, capacity) {
  if (cost !== undefined && !isPosInt(cost)) {
    throw fail('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  }
  const c = cost === undefined ? 1 : cost;
  if (c > capacity) {
    throw fail('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  }
  return c;
}

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') {
    throw fail('RL_INVALID_OPTIONS', 'options phải là object');
  }
  for (const n of names) {
    if (!isPosInt(options[n])) throw fail('RL_INVALID_OPTIONS', `${n} phải là số nguyên >= 1`);
  }
  if (typeof options.now !== 'function') {
    throw fail('RL_INVALID_OPTIONS', 'now phải là hàm');
  }
}

export function createTokenBucket(options) {
  checkOptions(options === undefined || options === null ? null : {
    ...options,
    refillAmount: options.refillAmount === undefined ? 1 : options.refillAmount,
    refillIntervalMs: options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs,
  }, ['capacity', 'refillAmount', 'refillIntervalMs']);
  const { capacity, now } = options;
  const A = options.refillAmount === undefined ? 1 : options.refillAmount;
  const I = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  const max = capacity * I; // token nhân với I để dùng số nguyên
  const keys = new Map(); // key -> { s, last }

  // Trạng thái đã nạp bù tại thời điểm t (không đổi trạng thái lưu).
  function view(st, t) {
    if (t <= st.last) return { s: st.s, last: st.last };
    return { s: Math.min(max, st.s + (t - st.last) * A), last: t };
  }

  function evaluate(key, cost, commit) {
    checkKey(key);
    const c = checkCost(cost, capacity);
    const t = now();
    const stored = keys.get(key);
    const v = stored ? view(stored, t) : { s: max, last: t };
    const need = c * I;
    if (!commit) {
      return {
        allowed: v.s >= need,
        retryAfterMs: v.s >= need ? 0 : Math.ceil((need - v.s) / A),
        remaining: Math.floor(v.s / I),
      };
    }
    let res;
    if (v.s >= need) {
      v.s -= need;
      res = { allowed: true, retryAfterMs: 0, remaining: Math.floor(v.s / I) };
    } else {
      res = { allowed: false, retryAfterMs: Math.ceil((need - v.s) / A), remaining: Math.floor(v.s / I) };
    }
    keys.set(key, v);
    return res;
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset: (key) => keys.delete(key),
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of [...keys]) {
        if (view(st, t).s >= max) {
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
  checkOptions(options, ['limit', 'windowMs']);
  const { limit, windowMs, now } = options;
  const keys = new Map(); // key -> [{ t, cost }]

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function evaluate(key, cost, commit) {
    checkKey(key);
    const c = checkCost(cost, limit);
    const t = now();
    const events = live(keys.get(key) || [], t);
    const used = events.reduce((a, e) => a + e.cost, 0);
    if (used + c <= limit) {
      if (commit) {
        events.push({ t, cost: c });
        keys.set(key, events);
        return { allowed: true, retryAfterMs: 0, remaining: limit - used - c };
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
    if (commit) keys.set(key, events);
    const target = used + c - limit;
    let acc = 0;
    let retry = 0;
    for (const e of events) {
      acc += e.cost;
      if (acc >= target) {
        retry = Math.ceil(e.t + windowMs - t);
        break;
      }
    }
    return { allowed: false, retryAfterMs: retry, remaining: limit - used };
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset: (key) => keys.delete(key),
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, events] of [...keys]) {
        const l = live(events, t);
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
