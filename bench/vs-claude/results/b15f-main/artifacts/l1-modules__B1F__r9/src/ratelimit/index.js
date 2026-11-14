// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function isPosInt(v) {
  return Number.isInteger(v) && v >= 1;
}

function checkArgs(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw err('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY', 'cost vượt quá sức chứa');
  return cost;
}

export function createTokenBucket(options) {
  const o = options;
  if (o === null || typeof o !== 'object') throw err('RL_INVALID_OPTIONS', 'thiếu tùy chọn');
  const { capacity, now } = o;
  const refillAmount = o.refillAmount === undefined ? 1 : o.refillAmount;
  const refillIntervalMs = o.refillIntervalMs === undefined ? 1000 : o.refillIntervalMs;
  if (!isPosInt(capacity) || !isPosInt(refillAmount) || !isPosInt(refillIntervalMs) || typeof now !== 'function') {
    throw err('RL_INVALID_OPTIONS', 'tùy chọn không hợp lệ');
  }
  const I = refillIntervalMs;
  const A = refillAmount;
  const full = capacity * I; // token tính theo đơn vị 1/I
  const states = new Map(); // key -> { tokens, last }

  // Trạng thái sau khi nạp đến thời điểm t (không ghi vào map).
  function project(st, t) {
    if (!st) return { tokens: full, last: t };
    const elapsed = t > st.last ? t - st.last : 0;
    return {
      tokens: Math.min(full, st.tokens + elapsed * A),
      last: t > st.last ? t : st.last,
    };
  }

  function evaluate(key, cost, commit) {
    cost = checkArgs(key, cost, capacity);
    const t = now();
    const cur = project(states.get(key), t);
    const need = cost * I;
    if (cur.tokens >= need) {
      if (commit) {
        cur.tokens -= need;
        states.set(key, cur);
        return { allowed: true, retryAfterMs: 0, remaining: Math.floor(cur.tokens / I) };
      }
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(cur.tokens / I) };
    }
    if (commit) states.set(key, cur);
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - cur.tokens) / A),
      remaining: Math.floor(cur.tokens / I),
    };
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset: (key) => states.delete(key),
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of [...states]) {
        if (project(st, t).tokens >= full) {
          states.delete(k);
          n++;
        }
      }
      return n;
    },
    size: () => states.size,
  };
}

export function createSlidingWindow(options) {
  const o = options;
  if (o === null || typeof o !== 'object') throw err('RL_INVALID_OPTIONS', 'thiếu tùy chọn');
  const { limit, windowMs, now } = o;
  if (!isPosInt(limit) || !isPosInt(windowMs) || typeof now !== 'function') {
    throw err('RL_INVALID_OPTIONS', 'tùy chọn không hợp lệ');
  }
  const events = new Map(); // key -> [{ t, cost }]

  const live = (list, t) => list.filter((e) => e.t > t - windowMs);

  function evaluate(key, cost, commit) {
    cost = checkArgs(key, cost, limit);
    const t = now();
    const list = live(events.get(key) || [], t);
    let used = 0;
    for (const e of list) used += e.cost;
    if (used + cost <= limit) {
      if (commit) {
        list.push({ t, cost });
        events.set(key, list);
        return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
    if (commit && events.has(key)) events.set(key, list);
    const target = used + cost - limit;
    let acc = 0;
    let retry = 0;
    for (const e of list) {
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
    reset: (key) => events.delete(key),
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, list] of [...events]) {
        const l = live(list, t);
        if (l.length === 0) {
          events.delete(k);
          n++;
        } else events.set(k, l);
      }
      return n;
    },
    size: () => events.size,
  };
}
