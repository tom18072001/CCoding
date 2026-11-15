// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now / timer.

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isSafeInteger(v) && v >= 1;

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') {
    throw fail('RL_INVALID_OPTIONS', 'options phải là object');
  }
  for (const n of names) {
    if (!isPosInt(options[n])) throw fail('RL_INVALID_OPTIONS', `${n} phải là số nguyên >= 1`);
  }
  if (typeof options.now !== 'function') throw fail('RL_INVALID_OPTIONS', 'now phải là hàm');
}

function checkArgs(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw fail('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw fail('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  if (cost > capacity) throw fail('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') {
    throw fail('RL_INVALID_OPTIONS', 'options phải là object');
  }
  const opts = {
    ...options,
    refillAmount: options.refillAmount === undefined ? 1 : options.refillAmount,
    refillIntervalMs: options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs,
  };
  checkOptions(opts, ['capacity', 'refillAmount', 'refillIntervalMs']);
  const { capacity, refillAmount, refillIntervalMs: I, now } = opts;
  const cap = capacity * I; // token nhân I (số nguyên)
  const keys = new Map(); // key -> { tok, last }

  // trạng thái sau khi nạp bù tại thời điểm t (không thay đổi state)
  function project(st, t) {
    if (!st) return { tok: cap, last: t };
    if (t <= st.last) return { tok: st.tok, last: st.last };
    return { tok: Math.min(cap, st.tok + (t - st.last) * refillAmount), last: t };
  }

  function evaluate(key, cost, commit) {
    cost = checkArgs(key, cost, capacity);
    const t = now();
    const p = project(keys.get(key), t);
    const need = cost * I;
    if (p.tok >= need) {
      if (commit) {
        p.tok -= need;
        keys.set(key, p);
      }
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(p.tok / I) };
    }
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - p.tok) / refillAmount),
      remaining: Math.floor(p.tok / I),
    };
  }

  function peek(key, cost) {
    const r = evaluate(key, cost, false);
    // peek: remaining là số còn lại hiện tại
    return r;
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek,
    reset(key) {
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of keys) {
        if (project(st, t).tok >= cap) {
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

  function evaluate(key, cost, commit) {
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
      if (keys.has(key)) keys.set(key, events);
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
    const target = used + cost - limit;
    let acc = 0;
    let last = events[0];
    for (const e of events) {
      acc += e.cost;
      last = e;
      if (acc >= target) break;
    }
    if (keys.has(key)) keys.set(key, events);
    return {
      allowed: false,
      retryAfterMs: Math.ceil(last.t + windowMs - t),
      remaining: limit - used,
    };
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset(key) {
      return keys.delete(key);
    },
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
