// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now/setTimeout/setInterval.

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

const isPosInt = (v) => Number.isInteger(v) && v >= 1;

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw fail('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
}

function checkCost(cost, capacity) {
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw fail('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  if (cost > capacity) throw fail('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') throw fail('RL_INVALID_OPTIONS', 'thiếu tùy chọn');
  for (const n of names) {
    if (!isPosInt(options[n])) throw fail('RL_INVALID_OPTIONS', `${n} phải là số nguyên >= 1`);
  }
  if (typeof options.now !== 'function') throw fail('RL_INVALID_OPTIONS', 'now phải là hàm');
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') throw fail('RL_INVALID_OPTIONS', 'thiếu tùy chọn');
  const A = options.refillAmount === undefined ? 1 : options.refillAmount;
  const I = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  checkOptions({ capacity: options.capacity, refillAmount: A, refillIntervalMs: I, now: options.now }, [
    'capacity',
    'refillAmount',
    'refillIntervalMs',
  ]);
  const { capacity, now } = options;
  const full = capacity * I; // token tính theo đơn vị 1/I (số nguyên)
  const keys = new Map(); // key -> { scaled, last }

  // Trạng thái đã nạp bù tại thời điểm t (không đổi state gốc).
  function refilled(st, t) {
    if (!st) return { scaled: full, last: t };
    if (t <= st.last) return { scaled: st.scaled, last: st.last };
    return { scaled: Math.min(full, st.scaled + (t - st.last) * A), last: t };
  }

  function evaluate(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, capacity);
    const st = refilled(keys.get(key), now());
    const need = cost * I;
    let allowed = false;
    let retryAfterMs = 0;
    if (st.scaled >= need) {
      allowed = true;
      if (commit) st.scaled -= need;
    } else {
      retryAfterMs = Math.ceil((need - st.scaled) / A);
    }
    if (commit) keys.set(key, st);
    // peek: remaining là số hiện tại (chưa trừ cost)
    return { allowed, retryAfterMs, remaining: Math.floor(st.scaled / I) };
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of [...keys]) {
        if (refilled(st, t).scaled >= full) {
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

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function evaluate(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, limit);
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
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
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
        } else keys.set(k, l);
      }
      return n;
    },
    size: () => keys.size,
  };
}

export const ratelimit = { createTokenBucket, createSlidingWindow };
