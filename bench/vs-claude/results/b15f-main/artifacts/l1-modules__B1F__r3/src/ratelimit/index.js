// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now/setTimeout.

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isInteger(v) && v >= 1;

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
}

function checkCost(cost, capacity) {
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw err('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') {
    throw err('RL_INVALID_OPTIONS', 'thiếu tùy chọn');
  }
  for (const n of names) {
    if (!isPosInt(options[n])) throw err('RL_INVALID_OPTIONS', `${n} phải là số nguyên >= 1`);
  }
  if (typeof options.now !== 'function') throw err('RL_INVALID_OPTIONS', 'now phải là hàm');
}

export function createTokenBucket(options) {
  checkOptions(
    options === null || typeof options !== 'object'
      ? options
      : { refillAmount: 1, refillIntervalMs: 1000, ...stripUndefined(options) },
    ['capacity', 'refillAmount', 'refillIntervalMs'],
  );
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const interval = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  // Mọi lượng token được nhân với `interval` để tính bằng số nguyên.
  const cap = capacity * interval;
  const keys = new Map(); // key -> { units, last }

  // Trạng thái sau khi nạp bù đến thời điểm t (không đổi dữ liệu).
  function project(st, t) {
    if (t <= st.last) return { units: st.units, last: st.last };
    const units = Math.min(cap, st.units + (t - st.last) * refillAmount);
    return { units, last: t };
  }

  function evaluate(key, cost, commit) {
    const t = now();
    const st = keys.get(key);
    const cur = st ? project(st, t) : { units: cap, last: t };
    const need = cost * interval;
    if (cur.units >= need) {
      const after = cur.units - need;
      if (commit) keys.set(key, { units: after, last: cur.last });
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(after / interval), cur };
    }
    if (commit) keys.set(key, cur);
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - cur.units) / refillAmount),
      remaining: Math.floor(cur.units / interval),
      cur,
    };
  }

  return {
    take(key, cost) {
      checkKey(key);
      cost = checkCost(cost, capacity);
      const { allowed, retryAfterMs, remaining } = evaluate(key, cost, true);
      return { allowed, retryAfterMs, remaining };
    },
    peek(key, cost) {
      checkKey(key);
      cost = checkCost(cost, capacity);
      const r = evaluate(key, cost, false);
      // peek: remaining là số còn lại hiện tại (chưa trừ cost)
      return {
        allowed: r.allowed,
        retryAfterMs: r.retryAfterMs,
        remaining: Math.floor(r.cur.units / interval),
      };
    },
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of [...keys]) {
        if (project(st, t).units >= cap) {
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

function stripUndefined(o) {
  const out = {};
  for (const k of Object.keys(o)) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

export function createSlidingWindow(options) {
  checkOptions(options, ['limit', 'windowMs']);
  const { limit, windowMs, now } = options;
  const keys = new Map(); // key -> [{ t, cost }]

  function live(events, t) {
    return events.filter((e) => e.t > t - windowMs);
  }

  function evaluate(key, cost, commit) {
    const t = now();
    const events = live(keys.get(key) || [], t);
    const used = events.reduce((s, e) => s + e.cost, 0);
    if (used + cost <= limit) {
      if (commit) {
        events.push({ t, cost });
        keys.set(key, events);
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used - (commit ? cost : 0), used };
    }
    if (commit && keys.has(key)) keys.set(key, events);
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
    return { allowed: false, retryAfterMs, remaining: limit - used, used };
  }

  return {
    take(key, cost) {
      checkKey(key);
      cost = checkCost(cost, limit);
      const { allowed, retryAfterMs, remaining } = evaluate(key, cost, true);
      return { allowed, retryAfterMs, remaining };
    },
    peek(key, cost) {
      checkKey(key);
      cost = checkCost(cost, limit);
      const r = evaluate(key, cost, false);
      return { allowed: r.allowed, retryAfterMs: r.retryAfterMs, remaining: limit - r.used };
    },
    reset(key) {
      checkKey(key);
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
        } else {
          keys.set(k, l);
        }
      }
      return n;
    },
    size() {
      return keys.size;
    },
  };
}
