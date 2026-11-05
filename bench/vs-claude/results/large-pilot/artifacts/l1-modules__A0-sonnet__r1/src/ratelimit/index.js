// ratelimit — xem SPEC.md, mục "Module ratelimit".
// Đồng hồ chỉ đến từ options.now.

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function posInt(v) {
  return Number.isSafeInteger(v) && v >= 1;
}

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
}

function checkCost(cost, capacity) {
  if (cost === undefined) cost = 1;
  if (!posInt(cost)) throw err('RL_INVALID_COST');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

function readOptions(options, names) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  if (typeof options.now !== 'function') throw err('RL_INVALID_OPTIONS');
  return names;
}

export function createTokenBucket(options) {
  readOptions(options, []);
  const { capacity, refillAmount = 1, refillIntervalMs = 1000, now } = options;
  if (!posInt(capacity) || !posInt(refillAmount) || !posInt(refillIntervalMs)) {
    throw err('RL_INVALID_OPTIONS');
  }
  // Số token được nhân với refillIntervalMs để tính toán toàn số nguyên (BigInt).
  const I = BigInt(refillIntervalMs);
  const R = BigInt(refillAmount);
  const CAP = BigInt(capacity) * I;
  const keys = new Map(); // key -> { scaled, last }

  // Trạng thái sau khi nạp bù đến thời điểm t (không ghi vào map).
  function refreshed(state, t) {
    if (!state) return { scaled: CAP, last: t };
    if (t <= state.last) return { scaled: state.scaled, last: state.last };
    let scaled = state.scaled + BigInt(Math.floor(t - state.last)) * R;
    if (scaled > CAP) scaled = CAP;
    return { scaled, last: t };
  }

  function attempt(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, capacity);
    const st = refreshed(keys.get(key), now());
    const need = BigInt(cost) * I;
    if (st.scaled >= need) {
      if (commit) {
        st.scaled -= need;
        keys.set(key, st);
      }
      const remaining = Number(st.scaled / I);
      return { allowed: true, retryAfterMs: 0, remaining: commit ? remaining : Number(st.scaled / I) };
    }
    if (commit) keys.set(key, st);
    const deficit = need - st.scaled;
    const retryAfterMs = Number((deficit + R - 1n) / R);
    return { allowed: false, retryAfterMs, remaining: Number(st.scaled / I) };
  }

  return {
    take: (key, cost) => attempt(key, cost, true),
    peek: (key, cost) => attempt(key, cost, false),
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let removed = 0;
      for (const [k, st] of keys) {
        if (refreshed(st, t).scaled >= CAP) {
          keys.delete(k);
          removed++;
        }
      }
      return removed;
    },
    size: () => keys.size,
  };
}

export function createSlidingWindow(options) {
  readOptions(options, []);
  const { limit, windowMs, now } = options;
  if (!posInt(limit) || !posInt(windowMs)) throw err('RL_INVALID_OPTIONS');
  const keys = new Map(); // key -> [{ t, cost }]

  const active = (events, t) => events.filter((e) => e.t > t - windowMs);
  const sum = (events) => events.reduce((s, e) => s + e.cost, 0);

  function attempt(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, limit);
    const t = now();
    const events = active(keys.get(key) ?? [], t);
    const used = sum(events);
    if (used + cost <= limit) {
      if (commit) {
        events.push({ t, cost });
        keys.set(key, events);
        return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
    if (commit) keys.set(key, events);
    const need = used + cost - limit;
    let cum = 0;
    let retryAfterMs = 0;
    for (const e of events) {
      cum += e.cost;
      if (cum >= need) {
        retryAfterMs = Math.ceil(e.t + windowMs - t);
        break;
      }
    }
    return { allowed: false, retryAfterMs, remaining: limit - used };
  }

  return {
    take: (key, cost) => attempt(key, cost, true),
    peek: (key, cost) => attempt(key, cost, false),
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let removed = 0;
      for (const [k, events] of keys) {
        const live = active(events, t);
        if (live.length === 0) {
          keys.delete(k);
          removed++;
        } else keys.set(k, live);
      }
      return removed;
    },
    size: () => keys.size,
  };
}
