// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now/setTimeout/setInterval.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isSafeInteger(v) && v >= 1;

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  for (const n of names) if (!isPosInt(options[n])) throw err('RL_INVALID_OPTIONS', n);
  if (typeof options.now !== 'function') throw err('RL_INVALID_OPTIONS', 'now');
}

function checkArgs(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw err('RL_INVALID_COST');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

export function createTokenBucket(options) {
  checkOptions(options, ['capacity']);
  const { now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const refillIntervalMs = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!isPosInt(refillAmount) || !isPosInt(refillIntervalMs)) throw err('RL_INVALID_OPTIONS');
  const capacity = options.capacity;
  const I = BigInt(refillIntervalMs);
  const R = BigInt(refillAmount);
  const capScaled = BigInt(capacity) * I; // token nhân refillIntervalMs
  const keys = new Map(); // key -> { s: BigInt, last: number }

  // Trả trạng thái đã nạp bù tới thời điểm t (không ghi vào map).
  function refilled(st, t) {
    if (!st) return { s: capScaled, last: t };
    if (t <= st.last) return { s: st.s, last: st.last };
    let s = st.s + BigInt(t - st.last) * R;
    if (s > capScaled) s = capScaled;
    return { s, last: t };
  }

  function run(key, cost, commit) {
    cost = checkArgs(key, cost, capacity);
    const t = now();
    const cur = refilled(keys.get(key), t);
    const need = BigInt(cost) * I;
    if (cur.s >= need) {
      const after = commit ? cur.s - need : cur.s;
      if (commit) keys.set(key, { s: after, last: cur.last });
      return { allowed: true, retryAfterMs: 0, remaining: Number(after / I) };
    }
    if (commit) keys.set(key, cur); // từ chối không tiêu gì, chỉ cập nhật nạp bù
    const deficit = need - cur.s;
    const retryAfterMs = Number((deficit + R - 1n) / R);
    return { allowed: false, retryAfterMs, remaining: Number(cur.s / I) };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset(key) {
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of [...keys]) {
        if (refilled(st, t).s >= capScaled) {
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
  const keys = new Map(); // key -> [{ t, cost }] (cũ → mới)

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function run(key, cost, commit) {
    cost = checkArgs(key, cost, limit);
    const t = now();
    const existing = keys.get(key);
    const events = existing ? live(existing, t) : [];
    if (existing && commit) keys.set(key, events);
    const used = events.reduce((a, e) => a + e.cost, 0);
    if (used + cost <= limit) {
      if (commit) {
        events.push({ t, cost });
        keys.set(key, events);
      }
      return { allowed: true, retryAfterMs: 0, remaining: commit ? limit - used - cost : limit - used };
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
    return { allowed: false, retryAfterMs, remaining: limit - used };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset(key) {
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, ev] of [...keys]) {
        const l = live(ev, t);
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
