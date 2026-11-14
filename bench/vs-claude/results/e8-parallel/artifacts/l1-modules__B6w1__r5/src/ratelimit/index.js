// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng đồng hồ thật hay bộ hẹn giờ.

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

const isPosInt = (v) => Number.isSafeInteger(v) && v >= 1;

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw fail('RL_INVALID_KEY');
}

function checkCost(cost, capacity) {
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw fail('RL_INVALID_COST');
  if (cost > capacity) throw fail('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') throw fail('RL_INVALID_OPTIONS');
  for (const n of names) {
    if (!isPosInt(options[n])) throw fail('RL_INVALID_OPTIONS');
  }
  if (typeof options.now !== 'function') throw fail('RL_INVALID_OPTIONS');
}

export function createTokenBucket(options) {
  checkOptions(options, ['capacity']);
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const interval = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!isPosInt(refillAmount) || !isPosInt(interval)) throw fail('RL_INVALID_OPTIONS');

  // Token tính theo đơn vị 1/interval token để toàn số nguyên (BigInt tránh tràn).
  const A = BigInt(refillAmount);
  const I = BigInt(interval);
  const capS = BigInt(capacity) * I;
  const keys = new Map(); // key -> { s: BigInt, last: number }

  // Trạng thái đã nạp bù tại thời điểm t (không ghi vào map).
  function view(key, t) {
    const st = keys.get(key);
    if (!st) return { s: capS, last: t, exists: false };
    let s = st.s;
    let last = st.last;
    if (t > last) {
      s += BigInt(t - last) * A;
      if (s > capS) s = capS;
      last = t;
    }
    return { s, last, exists: true };
  }

  function attempt(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, capacity);
    const t = now();
    const v = view(key, t);
    const need = BigInt(cost) * I;
    if (v.s >= need) {
      const s = commit ? v.s - need : v.s;
      if (commit) keys.set(key, { s, last: v.last });
      return {
        allowed: true,
        retryAfterMs: 0,
        remaining: Number((commit ? s : v.s) / I),
      };
    }
    if (commit) keys.set(key, { s: v.s, last: v.last });
    const lack = need - v.s;
    const retryAfterMs = Number((lack + A - 1n) / A);
    return { allowed: false, retryAfterMs, remaining: Number(v.s / I) };
  }

  return {
    take: (key, cost) => attempt(key, cost, true),
    peek: (key, cost) => attempt(key, cost, false),
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const key of [...keys.keys()]) {
        if (view(key, t).s >= capS) {
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
  checkOptions(options, ['limit', 'windowMs']);
  const { limit, windowMs, now } = options;
  const keys = new Map(); // key -> [{ t, cost }]

  function live(events, t) {
    return events.filter((e) => e.t > t - windowMs);
  }

  function attempt(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, limit);
    const t = now();
    const events = live(keys.get(key) || [], t);
    let used = 0;
    for (const e of events) used += e.cost;
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
    take: (key, cost) => attempt(key, cost, true),
    peek: (key, cost) => attempt(key, cost, false),
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [key, events] of [...keys]) {
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
