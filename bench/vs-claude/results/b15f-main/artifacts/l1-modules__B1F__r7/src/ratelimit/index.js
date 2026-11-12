// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now / setTimeout.

function rlError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function isPosInt(v) {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;
}

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') {
    throw rlError('RL_INVALID_OPTIONS', 'options phải là đối tượng');
  }
  for (const n of names) {
    if (!isPosInt(options[n])) throw rlError('RL_INVALID_OPTIONS', `${n} phải là số nguyên >= 1`);
  }
  if (typeof options.now !== 'function') throw rlError('RL_INVALID_OPTIONS', 'now phải là hàm');
}

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw rlError('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
}

// khóa → cost → cost so với sức chứa
function checkInput(key, cost, capacity) {
  checkKey(key);
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw rlError('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  if (cost > capacity) throw rlError('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

export function createTokenBucket(options) {
  let opts = options;
  if (opts !== undefined && opts !== null && typeof opts === 'object') {
    opts = { refillAmount: 1, refillIntervalMs: 1000, ...opts };
    if (options.refillAmount === undefined) opts.refillAmount = 1;
    if (options.refillIntervalMs === undefined) opts.refillIntervalMs = 1000;
  }
  checkOptions(opts, ['capacity', 'refillAmount', 'refillIntervalMs']);
  const { capacity, refillAmount, refillIntervalMs, now } = opts;
  const I = BigInt(refillIntervalMs);
  const A = BigInt(refillAmount);
  const full = BigInt(capacity) * I; // token tính theo đơn vị 1/refillIntervalMs
  const state = new Map(); // key → { tokens: BigInt (scaled), last: number }

  // trạng thái hiện tại (không ghi vào Map)
  function current(key, t) {
    const s = state.get(key);
    if (!s) return { tokens: full, last: t };
    let last = s.last;
    let tokens = s.tokens;
    if (t > last) {
      tokens += BigInt(t - last) * A;
      if (tokens > full) tokens = full;
      last = t;
    }
    return { tokens, last };
  }

  function result(allowed, tokens, cost) {
    const remaining = Number(tokens / I);
    if (allowed) return { allowed: true, retryAfterMs: 0, remaining };
    const need = BigInt(cost) * I - tokens;
    const retryAfterMs = Number((need + A - 1n) / A);
    return { allowed: false, retryAfterMs, remaining };
  }

  return {
    take(key, cost) {
      cost = checkInput(key, cost, capacity);
      const cur = current(key, now());
      const price = BigInt(cost) * I;
      if (cur.tokens >= price) {
        cur.tokens -= price;
        state.set(key, cur);
        return result(true, cur.tokens, cost);
      }
      state.set(key, cur);
      return result(false, cur.tokens, cost);
    },
    peek(key, cost) {
      cost = checkInput(key, cost, capacity);
      const cur = current(key, now());
      const ok = cur.tokens >= BigInt(cost) * I;
      return result(ok, cur.tokens, cost);
    },
    reset(key) {
      checkKey(key);
      return state.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const key of [...state.keys()]) {
        if (current(key, t).tokens >= full) {
          state.delete(key);
          n++;
        }
      }
      return n;
    },
    size() {
      return state.size;
    },
  };
}

export function createSlidingWindow(options) {
  checkOptions(options, ['limit', 'windowMs']);
  const { limit, windowMs, now } = options;
  const state = new Map(); // key → [{ t, cost }]

  function live(events, t) {
    return events.filter((e) => e.t > t - windowMs);
  }

  function evaluate(events, cost, t) {
    const used = events.reduce((a, e) => a + e.cost, 0);
    if (used + cost <= limit) return { allowed: true, used };
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
    return { allowed: false, used, retryAfterMs };
  }

  return {
    take(key, cost) {
      cost = checkInput(key, cost, limit);
      const t = now();
      const events = live(state.get(key) ?? [], t);
      const r = evaluate(events, cost, t);
      if (r.allowed) {
        events.push({ t, cost });
        state.set(key, events);
        return { allowed: true, retryAfterMs: 0, remaining: limit - r.used - cost };
      }
      state.set(key, events);
      return { allowed: false, retryAfterMs: r.retryAfterMs, remaining: limit - r.used };
    },
    peek(key, cost) {
      cost = checkInput(key, cost, limit);
      const t = now();
      const events = live(state.get(key) ?? [], t);
      const r = evaluate(events, cost, t);
      return {
        allowed: r.allowed,
        retryAfterMs: r.allowed ? 0 : r.retryAfterMs,
        remaining: limit - r.used,
      };
    },
    reset(key) {
      checkKey(key);
      return state.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [key, events] of [...state]) {
        const l = live(events, t);
        if (l.length === 0) {
          state.delete(key);
          n++;
        } else {
          state.set(key, l);
        }
      }
      return n;
    },
    size() {
      return state.size;
    },
  };
}
