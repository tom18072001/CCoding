// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now / setTimeout.

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function isPosInt(v) {
  return Number.isSafeInteger(v) && v >= 1;
}

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') throw fail('RL_INVALID_OPTIONS');
  for (const n of names) if (!isPosInt(options[n])) throw fail('RL_INVALID_OPTIONS', n);
  if (typeof options.now !== 'function') throw fail('RL_INVALID_OPTIONS', 'now');
}

function checkArgs(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw fail('RL_INVALID_KEY');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw fail('RL_INVALID_COST');
  if (cost > capacity) throw fail('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

export function createTokenBucket(options) {
  checkOptions(options, ['capacity']);
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const refillIntervalMs = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!isPosInt(refillAmount) || !isPosInt(refillIntervalMs)) throw fail('RL_INVALID_OPTIONS');

  const I = refillIntervalMs;
  const A = refillAmount;
  const maxScaled = capacity * I; // token nhân refillIntervalMs: toàn số nguyên
  const keys = new Map(); // key -> { scaled, last }

  // Trạng thái đã nạp bù tại thời điểm t (không ghi vào map).
  function refilled(st, t) {
    if (!st) return { scaled: maxScaled, last: t };
    if (t <= st.last) return { scaled: st.scaled, last: st.last }; // đồng hồ lùi: giữ mốc cũ
    const scaled = Math.min(maxScaled, st.scaled + (t - st.last) * A);
    return { scaled, last: t };
  }

  function attempt(key, cost, commit) {
    cost = checkArgs(key, cost, capacity);
    const t = now();
    const st = refilled(keys.get(key), t);
    const need = cost * I;
    if (st.scaled >= need) {
      const after = commit ? st.scaled - need : st.scaled;
      if (commit) keys.set(key, { scaled: after, last: st.last });
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor((commit ? after : st.scaled) / I) };
    }
    if (commit) keys.set(key, st);
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - st.scaled) / A),
      remaining: Math.floor(st.scaled / I),
    };
  }

  return {
    take: (key, cost) => attempt(key, cost, true),
    peek: (key, cost) => attempt(key, cost, false),
    reset: (key) => keys.delete(key),
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of keys) {
        if (refilled(st, t).scaled >= maxScaled) {
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

  function live(events, t) {
    return events.filter((e) => e.t > t - windowMs);
  }

  function attempt(key, cost, commit) {
    cost = checkArgs(key, cost, limit);
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
    let retryAfterMs = 0;
    for (const e of events) {
      acc += e.cost;
      if (acc >= need) {
        retryAfterMs = Math.ceil(e.t + windowMs - t);
        break;
      }
    }
    return { allowed: false, retryAfterMs, remaining: limit - used };
  }

  return {
    take: (key, cost) => attempt(key, cost, true),
    peek: (key, cost) => attempt(key, cost, false),
    reset: (key) => keys.delete(key),
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, events] of keys) {
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
