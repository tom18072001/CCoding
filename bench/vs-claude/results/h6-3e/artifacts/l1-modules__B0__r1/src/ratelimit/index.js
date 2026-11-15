// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now/setTimeout/setInterval.

function rlError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isInteger(v) && v >= 1;

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') {
    throw rlError('RL_INVALID_OPTIONS', 'options phải là đối tượng');
  }
  for (const n of names) {
    if (!isPosInt(options[n])) throw rlError('RL_INVALID_OPTIONS', `${n} không hợp lệ`);
  }
  if (typeof options.now !== 'function') throw rlError('RL_INVALID_OPTIONS', 'now phải là hàm');
}

function checkInput(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw rlError('RL_INVALID_KEY', 'key không hợp lệ');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw rlError('RL_INVALID_COST', 'cost không hợp lệ');
  if (cost > capacity) throw rlError('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') throw rlError('RL_INVALID_OPTIONS', 'options phải là đối tượng');
  const { capacity, refillAmount = 1, refillIntervalMs = 1000, now } = options;
  checkOptions({ capacity, refillAmount, refillIntervalMs, now }, ['capacity', 'refillAmount', 'refillIntervalMs']);
  // Token được lưu dạng số nguyên nhân với refillIntervalMs.
  const capS = capacity * refillIntervalMs;
  const keys = new Map(); // key -> { tokens, last }

  // Trả trạng thái đã nạp bù (không ghi vào map).
  function refilled(st, t) {
    if (t <= st.last) return { tokens: st.tokens, last: st.last };
    const tokens = Math.min(capS, st.tokens + (t - st.last) * refillAmount);
    return { tokens, last: t };
  }

  function evaluate(key, cost, commit) {
    cost = checkInput(key, cost, capacity);
    const t = now();
    const existing = keys.get(key);
    const st = existing ? refilled(existing, t) : { tokens: capS, last: t };
    const costS = cost * refillIntervalMs;
    let res;
    if (st.tokens >= costS) {
      if (commit) st.tokens -= costS;
      res = { allowed: true, retryAfterMs: 0, remaining: Math.floor(st.tokens / refillIntervalMs) };
      if (!commit) res.remaining = Math.floor((st.tokens) / refillIntervalMs);
    } else {
      res = {
        allowed: false,
        retryAfterMs: Math.ceil((costS - st.tokens) / refillAmount),
        remaining: Math.floor(st.tokens / refillIntervalMs),
      };
    }
    if (commit) keys.set(key, st);
    return res;
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek(key, cost) {
      const r = evaluate(key, cost, false);
      return r;
    },
    reset: (key) => keys.delete(key),
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of [...keys]) {
        if (refilled(st, t).tokens >= capS) { keys.delete(k); n++; }
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
    let i = 0;
    while (i < events.length && !(events[i].t > t - windowMs)) i++;
    if (i > 0) events.splice(0, i);
    return events;
  }

  function evaluate(key, cost, commit) {
    cost = checkInput(key, cost, limit);
    const t = now();
    const events = keys.has(key) ? live(keys.get(key), t) : [];
    const used = events.reduce((s, e) => s + e.cost, 0);
    if (used + cost <= limit) {
      if (commit) {
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
      if (acc >= need) { retryAfterMs = Math.ceil(e.t + windowMs - t); break; }
    }
    return { allowed: false, retryAfterMs, remaining: limit - used };
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset: (key) => keys.delete(key),
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, ev] of [...keys]) {
        if (live(ev, t).length === 0) { keys.delete(k); n++; }
      }
      return n;
    },
    size: () => keys.size,
  };
}

export const ratelimit = { createTokenBucket, createSlidingWindow };
