// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now / setTimeout.

function rlError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function isPosInt(v) {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;
}

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') {
    throw rlError('RL_INVALID_OPTIONS', 'options phải là object');
  }
  for (const n of names) {
    if (!isPosInt(options[n])) throw rlError('RL_INVALID_OPTIONS', `${n} phải là số nguyên >= 1`);
  }
  if (typeof options.now !== 'function') {
    throw rlError('RL_INVALID_OPTIONS', 'now phải là hàm');
  }
}

// Thứ tự: khóa → cost → cost so với sức chứa.
function checkInput(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw rlError('RL_INVALID_KEY', 'key không hợp lệ');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw rlError('RL_INVALID_COST', 'cost không hợp lệ');
  if (cost > capacity) throw rlError('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

export function createTokenBucket(options) {
  if (options !== null && typeof options === 'object') {
    const { refillAmount = 1, refillIntervalMs = 1000 } = options;
    options = { ...options, refillAmount, refillIntervalMs };
  }
  checkOptions(options, ['capacity', 'refillAmount', 'refillIntervalMs']);
  const { capacity, refillAmount, refillIntervalMs, now } = options;
  const I = BigInt(refillIntervalMs);
  const A = BigInt(refillAmount);
  const CAP = BigInt(capacity) * I; // mọi lượng token nhân với refillIntervalMs
  const buckets = new Map(); // key -> { level: BigInt, last: number }

  // Trạng thái hiện tại (sau nạp bù) mà không ghi vào map.
  function project(key, t) {
    const b = buckets.get(key);
    if (!b) return { level: CAP, last: t };
    if (t <= b.last) return { level: b.level, last: b.last }; // đồng hồ lùi: giữ mốc cũ
    let level = b.level + BigInt(t - b.last) * A;
    if (level > CAP) level = CAP;
    return { level, last: t };
  }

  function evaluate(key, cost, commit) {
    const c = checkInput(key, cost, capacity);
    const t = now();
    const s = project(key, t);
    const need = BigInt(c) * I;
    let result;
    if (s.level >= need) {
      const after = commit ? s.level - need : s.level;
      result = { allowed: true, retryAfterMs: 0, remaining: Number(after / I) };
      if (commit) buckets.set(key, { level: after, last: s.last });
    } else {
      const deficit = need - s.level;
      const wait = (deficit + A - 1n) / A;
      result = { allowed: false, retryAfterMs: Number(wait), remaining: Number(s.level / I) };
      if (commit) buckets.set(key, { level: s.level, last: s.last });
    }
    return result;
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset(key) {
      return buckets.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const key of [...buckets.keys()]) {
        if (project(key, t).level >= CAP) {
          buckets.delete(key);
          n++;
        }
      }
      return n;
    },
    size: () => buckets.size,
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

  function evaluate(key, cost, commit) {
    const c = checkInput(key, cost, limit);
    const t = now();
    const events = keys.get(key) || [];
    prune(events, t);
    let used = 0;
    for (const e of events) used += e.cost;
    if (used + c <= limit) {
      if (commit) {
        events.push({ t, cost: c });
        keys.set(key, events);
      } else if (keys.has(key) && events.length === 0) {
        // peek không tạo khóa; khóa sẵn có giữ nguyên
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used - (commit ? c : 0) };
    }
    const target = used + c - limit;
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
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [key, events] of [...keys.entries()]) {
        prune(events, t);
        if (events.length === 0) {
          keys.delete(key);
          n++;
        }
      }
      return n;
    },
    size: () => keys.size,
  };
}
