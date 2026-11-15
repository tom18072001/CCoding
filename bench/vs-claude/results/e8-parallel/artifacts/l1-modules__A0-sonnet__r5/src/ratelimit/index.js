// ratelimit — xem SPEC.md, mục "Module ratelimit". Đồng hồ chỉ đến từ options.now.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function posInt(v) {
  return Number.isSafeInteger(v) && v >= 1;
}

function checkArgs(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
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
  const I = BigInt(refillIntervalMs);
  const A = BigInt(refillAmount);
  const capS = BigInt(capacity) * I; // token nhân refillIntervalMs
  const keys = new Map(); // key -> { s: bigint, last: number }

  // Trạng thái đã nạp bù tại thời điểm t (không ghi vào map)
  function refilled(st, t) {
    if (t <= st.last) return { s: st.s, last: st.last };
    let s = st.s + BigInt(t - st.last) * A;
    if (s > capS) s = capS;
    return { s, last: t };
  }

  function view(key) {
    const t = now();
    const st = keys.get(key);
    return { t, st: st ? refilled(st, t) : { s: capS, last: t }, exists: !!st };
  }

  function result(allowed, s, costS) {
    const retryAfterMs = allowed ? 0 : Number((costS - s + A - 1n) / A);
    return { allowed, retryAfterMs, remaining: Number(s / I) };
  }

  return {
    take(key, cost) {
      cost = checkArgs(key, cost, capacity);
      const { st } = view(key);
      const costS = BigInt(cost) * I;
      if (st.s >= costS) {
        st.s -= costS;
        keys.set(key, st);
        return result(true, st.s, costS);
      }
      keys.set(key, st);
      return result(false, st.s, costS);
    },
    peek(key, cost) {
      cost = checkArgs(key, cost, capacity);
      const { st } = view(key);
      const costS = BigInt(cost) * I;
      return result(st.s >= costS, st.s, costS);
    },
    reset(key) {
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of [...keys]) {
        if (refilled(st, t).s >= capS) {
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
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const { limit, windowMs, now } = options;
  if (!posInt(limit) || !posInt(windowMs) || typeof now !== 'function') throw err('RL_INVALID_OPTIONS');
  const keys = new Map(); // key -> [{ t, cost }]

  function live(events, t) {
    return events.filter((e) => e.t > t - windowMs);
  }

  function evaluate(events, t, cost) {
    const used = events.reduce((a, e) => a + e.cost, 0);
    if (used + cost <= limit) return { allowed: true, used, retryAfterMs: 0 };
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
    return { allowed: false, used, retryAfterMs: retry };
  }

  return {
    take(key, cost) {
      cost = checkArgs(key, cost, limit);
      const t = now();
      const events = live(keys.get(key) || [], t);
      const r = evaluate(events, t, cost);
      if (r.allowed) events.push({ t, cost });
      if (r.allowed || keys.has(key)) keys.set(key, events);
      const used = r.used + (r.allowed ? cost : 0);
      return { allowed: r.allowed, retryAfterMs: r.retryAfterMs, remaining: limit - used };
    },
    peek(key, cost) {
      cost = checkArgs(key, cost, limit);
      const t = now();
      const events = live(keys.get(key) || [], t);
      const r = evaluate(events, t, cost);
      return { allowed: r.allowed, retryAfterMs: r.retryAfterMs, remaining: limit - r.used };
    },
    reset(key) {
      return keys.delete(key);
    },
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
    size() {
      return keys.size;
    },
  };
}
