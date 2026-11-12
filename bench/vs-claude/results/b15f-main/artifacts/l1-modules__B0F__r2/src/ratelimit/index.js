// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now / setTimeout.

function rlError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isInteger(v) && v >= 1;

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') {
    throw rlError('RL_INVALID_OPTIONS', 'options phải là object');
  }
  for (const n of names) {
    if (!isPosInt(options[n])) throw rlError('RL_INVALID_OPTIONS', `${n} phải là số nguyên >= 1`);
  }
  if (typeof options.now !== 'function') throw rlError('RL_INVALID_OPTIONS', 'now phải là hàm');
}

function checkInput(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw rlError('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw rlError('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  if (cost > capacity) throw rlError('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

export function createTokenBucket(options) {
  if (options !== null && typeof options === 'object') {
    options = { refillAmount: 1, refillIntervalMs: 1000, ...options };
    if (options.refillAmount === undefined) options.refillAmount = 1;
    if (options.refillIntervalMs === undefined) options.refillIntervalMs = 1000;
  }
  checkOptions(options, ['capacity', 'refillAmount', 'refillIntervalMs']);
  const { capacity, refillAmount, refillIntervalMs, now } = options;
  // Token được lưu theo đơn vị "token × refillIntervalMs" để tính số nguyên chính xác.
  const capScaled = capacity * refillIntervalMs;
  const keys = new Map(); // key -> { scaled, last }

  // Trạng thái sau khi nạp bù đến thời điểm t (không đổi state gốc).
  function refilled(st, t) {
    const elapsed = Math.max(0, t - st.last);
    return {
      scaled: Math.min(capScaled, st.scaled + elapsed * refillAmount),
      last: Math.max(st.last, t),
    };
  }

  function evaluate(key, cost, commit) {
    cost = checkInput(key, cost, capacity);
    const t = now();
    const cur = keys.get(key);
    const st = cur ? refilled(cur, t) : { scaled: capScaled, last: t };
    const need = cost * refillIntervalMs;
    let res;
    if (st.scaled >= need) {
      if (commit) st.scaled -= need;
      res = { allowed: true, retryAfterMs: 0, remaining: Math.floor(st.scaled / refillIntervalMs) };
    } else {
      res = {
        allowed: false,
        retryAfterMs: Math.ceil((need - st.scaled) / refillAmount),
        remaining: Math.floor(st.scaled / refillIntervalMs),
      };
    }
    if (commit) keys.set(key, st);
    return res;
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
      for (const [k, st] of keys) {
        if (refilled(st, t).scaled >= capScaled) {
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
  const keys = new Map(); // key -> [{t, cost}]

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function evaluate(key, cost, commit) {
    cost = checkInput(key, cost, limit);
    const t = now();
    const events = live(keys.get(key) ?? [], t);
    const used = events.reduce((s, e) => s + e.cost, 0);
    if (used + cost <= limit) {
      if (commit) {
        events.push({ t, cost });
        keys.set(key, events);
        return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
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
    if (commit && keys.has(key)) keys.set(key, events);
    return { allowed: false, retryAfterMs, remaining: limit - used };
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
