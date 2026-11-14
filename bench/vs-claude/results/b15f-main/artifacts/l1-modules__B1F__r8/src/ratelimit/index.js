// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now/setTimeout/setInterval.

function rlError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isSafeInteger(v) && v >= 1;

function checkOptions(options, fields) {
  if (options === null || typeof options !== 'object') {
    throw rlError('RL_INVALID_OPTIONS', 'tùy chọn thiếu hoặc sai kiểu');
  }
  for (const f of fields) {
    if (!isPosInt(options[f])) throw rlError('RL_INVALID_OPTIONS', `${f} không hợp lệ`);
  }
  if (typeof options.now !== 'function') {
    throw rlError('RL_INVALID_OPTIONS', 'now phải là hàm');
  }
}

// Thứ tự: khóa → cost → cost so với sức chứa. Trả về cost đã chuẩn hóa.
function checkArgs(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw rlError('RL_INVALID_KEY', 'key không hợp lệ');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw rlError('RL_INVALID_COST', 'cost không hợp lệ');
  if (cost > capacity) throw rlError('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

export function createTokenBucket(options) {
  checkOptions(options, ['capacity']);
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const refillIntervalMs = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!isPosInt(refillAmount) || !isPosInt(refillIntervalMs)) {
    throw rlError('RL_INVALID_OPTIONS', 'refill không hợp lệ');
  }
  // Số token được nhân với refillIntervalMs để tính số nguyên chính xác.
  const I = BigInt(refillIntervalMs);
  const A = BigInt(refillAmount);
  const CAP = BigInt(capacity) * I;
  const states = new Map(); // key -> { tokens (đã nhân I), last }

  // Trạng thái hiện tại (đã nạp bù) mà không ghi vào map.
  function project(key, t) {
    const s = states.get(key);
    if (!s) return { tokens: CAP, last: t, exists: false };
    if (t <= s.last) return { tokens: s.tokens, last: s.last, exists: true };
    let tokens = s.tokens + BigInt(t - s.last) * A;
    if (tokens > CAP) tokens = CAP;
    return { tokens, last: t, exists: true };
  }

  function evaluate(key, cost, commit) {
    cost = checkArgs(key, cost, capacity);
    const p = project(key, now());
    const need = BigInt(cost) * I;
    if (p.tokens >= need) {
      const after = commit ? p.tokens - need : p.tokens;
      if (commit) states.set(key, { tokens: after, last: p.last });
      return { allowed: true, retryAfterMs: 0, remaining: Number(after / I) };
    }
    if (commit) states.set(key, { tokens: p.tokens, last: p.last });
    const deficit = need - p.tokens;
    const retry = (deficit + A - 1n) / A;
    return { allowed: false, retryAfterMs: Number(retry), remaining: Number(p.tokens / I) };
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset(key) {
      return states.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const key of [...states.keys()]) {
        if (project(key, t).tokens >= CAP) {
          states.delete(key);
          n++;
        }
      }
      return n;
    },
    size: () => states.size,
  };
}

export function createSlidingWindow(options) {
  checkOptions(options, ['limit', 'windowMs']);
  const { limit, windowMs, now } = options;
  const states = new Map(); // key -> [{ t, cost }] từ cũ đến mới

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function evaluate(key, cost, commit) {
    cost = checkArgs(key, cost, limit);
    const t = now();
    const existing = states.get(key);
    const events = existing ? live(existing, t) : [];
    if (existing && commit) states.set(key, events);
    const used = events.reduce((s, e) => s + e.cost, 0);
    if (used + cost <= limit) {
      if (commit) {
        events.push({ t, cost });
        states.set(key, events);
        return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
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
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset(key) {
      return states.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [key, events] of [...states]) {
        const l = live(events, t);
        if (l.length === 0) {
          states.delete(key);
          n++;
        } else {
          states.set(key, l);
        }
      }
      return n;
    },
    size: () => states.size,
  };
}
