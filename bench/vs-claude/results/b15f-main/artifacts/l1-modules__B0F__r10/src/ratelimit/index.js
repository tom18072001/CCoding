// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now/setTimeout.

function rlError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isInteger(v) && v >= 1;

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') throw rlError('RL_INVALID_OPTIONS');
  if (typeof options.now !== 'function') throw rlError('RL_INVALID_OPTIONS');
  for (const [name, def] of names) {
    const v = options[name] === undefined ? def : options[name];
    if (!isPosInt(v)) throw rlError('RL_INVALID_OPTIONS');
  }
}

// Thứ tự: khóa → cost → cost so với sức chứa.
function checkInput(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw rlError('RL_INVALID_KEY');
  const c = cost === undefined ? 1 : cost;
  if (!isPosInt(c)) throw rlError('RL_INVALID_COST');
  if (c > capacity) throw rlError('RL_COST_EXCEEDS_CAPACITY');
  return c;
}

export function createTokenBucket(options) {
  checkOptions(options, [['capacity'], ['refillAmount', 1], ['refillIntervalMs', 1000]]);
  const capacity = options.capacity;
  const amount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const interval = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  const now = options.now;
  // Mọi lượng token nhân với `interval` để tính bằng số nguyên (BigInt, tránh tràn).
  const full = BigInt(capacity) * BigInt(interval);
  const A = BigInt(amount);
  const I = BigInt(interval);
  const keys = new Map(); // key -> { scaled: bigint, last: number }

  // Trả trạng thái đã nạp bù tại thời điểm t (không ghi vào Map).
  function refilled(state, t) {
    if (!state) return { scaled: full, last: t };
    if (t <= state.last) return { scaled: state.scaled, last: state.last }; // đồng hồ lùi: giữ mốc cũ
    let scaled = state.scaled + BigInt(t - state.last) * A;
    if (scaled > full) scaled = full;
    return { scaled, last: t };
  }

  function evaluate(key, cost, commit) {
    const c = checkInput(key, cost, capacity);
    const t = now();
    const st = refilled(keys.get(key), t);
    const need = BigInt(c) * I;
    let result;
    if (st.scaled >= need) {
      if (commit) st.scaled -= need;
      result = { allowed: true, retryAfterMs: 0 };
    } else {
      const missing = need - st.scaled; // token*interval; thời gian = missing / amount
      result = { allowed: false, retryAfterMs: Number((missing + A - 1n) / A) };
    }
    // remaining: take = sau thao tác; peek = hiện tại (chưa trừ).
    result.remaining = Number(st.scaled / I);
    if (commit) keys.set(key, st);
    return result;
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset: (key) => keys.delete(key),
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, s] of [...keys]) {
        if (refilled(s, t).scaled >= full) { keys.delete(k); n++; }
      }
      return n;
    },
    size: () => keys.size,
  };
}

export function createSlidingWindow(options) {
  checkOptions(options, [['limit'], ['windowMs']]);
  const { limit, windowMs, now } = options;
  const keys = new Map(); // key -> [{ t, cost }] theo thứ tự cũ → mới

  const alive = (events, t) => events.filter((e) => e.t > t - windowMs);

  function evaluate(key, cost, commit) {
    const c = checkInput(key, cost, limit);
    const t = now();
    const events = alive(keys.get(key) || [], t);
    const used = events.reduce((s, e) => s + e.cost, 0);
    let result;
    if (used + c <= limit) {
      result = { allowed: true, retryAfterMs: 0, remaining: commit ? limit - used - c : limit - used };
      if (commit) events.push({ t, cost: c });
    } else {
      const need = used + c - limit;
      let acc = 0;
      let wait = 0;
      for (const e of events) {
        acc += e.cost;
        if (acc >= need) { wait = Math.ceil(e.t + windowMs - t); break; }
      }
      result = { allowed: false, retryAfterMs: wait, remaining: limit - used };
    }
    if (commit) keys.set(key, events);
    return result;
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset: (key) => keys.delete(key),
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, ev] of [...keys]) {
        const a = alive(ev, t);
        if (a.length === 0) { keys.delete(k); n++; } else keys.set(k, a);
      }
      return n;
    },
    size: () => keys.size,
  };
}
