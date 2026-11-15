// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isInteger(v) && v >= 1;

function checkOptions(options, fields) {
  if (options === null || typeof options !== 'object') {
    throw fail('RL_INVALID_OPTIONS', 'options phải là object');
  }
  for (const f of fields) {
    if (!isPosInt(options[f])) throw fail('RL_INVALID_OPTIONS', `${f} phải là số nguyên >= 1`);
  }
  if (typeof options.now !== 'function') throw fail('RL_INVALID_OPTIONS', 'now phải là hàm');
}

function checkInput(key, cost, max) {
  if (typeof key !== 'string' || key === '') throw fail('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw fail('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  if (cost > max) throw fail('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

export function createTokenBucket(options) {
  checkOptions(options, ['capacity']);
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const refillIntervalMs = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!isPosInt(refillAmount) || !isPosInt(refillIntervalMs)) {
    throw fail('RL_INVALID_OPTIONS', 'refillAmount/refillIntervalMs phải là số nguyên >= 1');
  }
  const I = refillIntervalMs;
  const max = capacity * I; // token tính theo đơn vị 1/I để dùng số nguyên
  const keys = new Map(); // key -> { scaled, last }

  // Trạng thái sau khi nạp bù tại thời điểm t (không đổi state gốc).
  function refilled(st, t) {
    if (!st) return { scaled: max, last: t };
    if (t <= st.last) return { scaled: st.scaled, last: st.last };
    const scaled = Math.min(max, st.scaled + (t - st.last) * refillAmount);
    return { scaled, last: t };
  }

  function run(key, cost, consume) {
    cost = checkInput(key, cost, capacity);
    const st = refilled(keys.get(key), now());
    const need = cost * I;
    if (st.scaled >= need) {
      if (consume) {
        st.scaled -= need;
        keys.set(key, st);
        return { allowed: true, retryAfterMs: 0, remaining: Math.floor(st.scaled / I) };
      }
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(st.scaled / I) };
    }
    if (consume) keys.set(key, st);
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - st.scaled) / refillAmount),
      remaining: Math.floor(st.scaled / I),
    };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset: (key) => keys.delete(key),
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of [...keys]) {
        if (refilled(st, t).scaled >= max) {
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

  function prune(events, t) {
    let i = 0;
    while (i < events.length && events[i].t <= t - windowMs) i++;
    if (i > 0) events.splice(0, i);
  }

  function run(key, cost, consume) {
    cost = checkInput(key, cost, limit);
    const t = now();
    const events = keys.get(key) || [];
    prune(events, t);
    let used = 0;
    for (const e of events) used += e.cost;
    if (used + cost <= limit) {
      if (consume) {
        events.push({ t, cost });
        keys.set(key, events);
        return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
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
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset: (key) => keys.delete(key),
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
    size: () => keys.size,
  };
}
