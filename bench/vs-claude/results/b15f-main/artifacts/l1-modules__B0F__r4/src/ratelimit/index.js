// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ options.now; không dùng Date.now/setTimeout/setInterval.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

const isPosInt = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;

function checkKey(key) {
  if (typeof key !== 'string' || key.length === 0) throw err('RL_INVALID_KEY');
}

function checkCost(cost, capacity) {
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw err('RL_INVALID_COST');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

function checkOptions(options, fields) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  for (const [name, def] of Object.entries(fields)) {
    const v = options[name] === undefined ? def : options[name];
    if (!isPosInt(v)) throw err('RL_INVALID_OPTIONS');
  }
  if (typeof options.now !== 'function') throw err('RL_INVALID_OPTIONS');
}

export function createTokenBucket(options) {
  checkOptions(options, { capacity: undefined, refillAmount: 1, refillIntervalMs: 1000 });
  const now = options.now;
  const capacity = options.capacity;
  const amount = BigInt(options.refillAmount ?? 1);
  const interval = BigInt(options.refillIntervalMs ?? 1000);
  const capScaled = BigInt(capacity) * interval; // token nhân refillIntervalMs
  const keys = new Map(); // key -> { tokens (scaled), last }

  // Trạng thái sau khi nạp bù đến thời điểm t (không đổi dữ liệu lưu).
  function project(st, t) {
    if (!st) return { tokens: capScaled, last: t };
    if (t <= st.last) return { tokens: st.tokens, last: st.last }; // đồng hồ lùi: giữ mốc cũ
    let tokens = st.tokens + BigInt(t - st.last) * amount;
    if (tokens > capScaled) tokens = capScaled;
    return { tokens, last: t };
  }

  function evaluate(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, capacity);
    const st = project(keys.get(key), now());
    const need = BigInt(cost) * interval;
    const current = Number(st.tokens / interval); // peek: số còn lại hiện tại
    if (st.tokens >= need) {
      if (commit) {
        st.tokens -= need;
        keys.set(key, st);
      }
      return { allowed: true, retryAfterMs: 0, remaining: commit ? Number(st.tokens / interval) : current };
    }
    if (commit) keys.set(key, st); // lưu mốc đã nạp bù; từ chối không tiêu gì
    const retry = (need - st.tokens + amount - 1n) / amount;
    return { allowed: false, retryAfterMs: Number(retry), remaining: current };
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
        if (project(st, t).tokens >= capScaled) {
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
  checkOptions(options, { limit: undefined, windowMs: undefined });
  const now = options.now;
  const { limit, windowMs } = options;
  const keys = new Map(); // key -> [{t, cost}] cũ → mới

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function evaluate(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, limit);
    const t = now();
    const events = live(keys.get(key) || [], t);
    let used = 0;
    for (const e of events) used += e.cost;
    if (used + cost <= limit) {
      if (!commit) return { allowed: true, retryAfterMs: 0, remaining: limit - used };
      events.push({ t, cost });
      keys.set(key, events);
      return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
    }
    if (commit && keys.has(key)) keys.set(key, events);
    const need = used + cost - limit;
    let cum = 0;
    let retry = 0;
    for (const e of events) {
      cum += e.cost;
      if (cum >= need) {
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
