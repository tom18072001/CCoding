// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ options.now; không dùng bộ đếm thời gian của hệ thống.

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function isPosInt(v) {
  return Number.isSafeInteger(v) && v >= 1;
}

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') {
    throw fail('RL_INVALID_OPTIONS', 'options phải là đối tượng');
  }
  for (const n of names) {
    if (!isPosInt(options[n])) throw fail('RL_INVALID_OPTIONS', `${n} phải là số nguyên >= 1`);
  }
  if (typeof options.now !== 'function') throw fail('RL_INVALID_OPTIONS', 'now phải là hàm');
}

function checkArgs(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw fail('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
  if (cost === undefined) cost = 1;
  if (!Number.isInteger(cost) || cost < 1) throw fail('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  if (cost > capacity) throw fail('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

function ceilDiv(a, b) {
  return Math.floor((a + b - 1) / b);
}

export function createTokenBucket(options) {
  checkOptions(options, ['capacity']);
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const refillIntervalMs = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!isPosInt(refillAmount) || !isPosInt(refillIntervalMs)) {
    throw fail('RL_INVALID_OPTIONS', 'refillAmount/refillIntervalMs phải là số nguyên >= 1');
  }
  // Đơn vị nội bộ: token × refillIntervalMs (số nguyên).
  const capU = capacity * refillIntervalMs;
  const keys = new Map(); // key -> { units, last }

  // Trả trạng thái đã nạp bù đến thời điểm t (không ghi vào map).
  function refilled(st, t) {
    if (!st) return { units: capU, last: t };
    if (t <= st.last) return { units: st.units, last: st.last };
    const units = Math.min(capU, st.units + (t - st.last) * refillAmount);
    return { units, last: t };
  }

  function evaluate(key, cost, consume) {
    cost = checkArgs(key, cost, capacity);
    const t = now();
    const st = refilled(keys.get(key), t);
    const costU = cost * refillIntervalMs;
    if (st.units >= costU) {
      if (consume) {
        st.units -= costU;
        keys.set(key, st);
      }
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(st.units / refillIntervalMs) };
    }
    if (consume) keys.set(key, st);
    return {
      allowed: false,
      retryAfterMs: ceilDiv(costU - st.units, refillAmount),
      remaining: Math.floor(st.units / refillIntervalMs),
    };
  }

  return {
    take(key, cost) {
      return evaluate(key, cost, true);
    },
    peek(key, cost) {
      return evaluate(key, cost, false);
    },
    reset(key) {
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of [...keys]) {
        if (refilled(st, t).units >= capU) {
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
  checkOptions(options, ['limit', 'windowMs']);
  const { limit, windowMs, now } = options;
  const keys = new Map(); // key -> [{ t, cost }]

  function prune(events, t) {
    let i = 0;
    while (i < events.length && events[i].t <= t - windowMs) i++;
    if (i > 0) events.splice(0, i);
  }

  function evaluate(key, cost, consume) {
    cost = checkArgs(key, cost, limit);
    const t = now();
    const existing = keys.get(key);
    const events = existing || [];
    prune(events, t);
    let used = 0;
    for (const e of events) used += e.cost;
    if (used + cost <= limit) {
      if (consume) {
        events.push({ t, cost });
        if (!existing) keys.set(key, events);
        used += cost;
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
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
    take(key, cost) {
      return evaluate(key, cost, true);
    },
    peek(key, cost) {
      return evaluate(key, cost, false);
    },
    reset(key) {
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, events] of [...keys]) {
        prune(events, t);
        if (events.length === 0) {
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
