// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isSafeInteger(v) && v >= 1;

function checkArgs(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw err('RL_INVALID_COST');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const interval = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!isPosInt(capacity) || !isPosInt(refillAmount) || !isPosInt(interval) || typeof now !== 'function') {
    throw err('RL_INVALID_OPTIONS');
  }
  // Token được nhân với interval để tính số nguyên.
  const cap = capacity * interval;
  const states = new Map(); // key -> { s, last }

  // Trả trạng thái đã nạp bù đến thời điểm t (không ghi vào map).
  function refreshed(st, t) {
    if (t > st.last) {
      return { s: Math.min(cap, st.s + (t - st.last) * refillAmount), last: t };
    }
    return { s: st.s, last: st.last };
  }

  function run(key, cost, commit) {
    cost = checkArgs(key, cost, capacity);
    const t = now();
    const existing = states.get(key);
    const st = existing ? refreshed(existing, t) : { s: cap, last: t };
    const need = cost * interval;
    let result;
    if (st.s >= need) {
      const before = st.s;
      if (commit) st.s -= need;
      result = { allowed: true, retryAfterMs: 0, remaining: Math.floor((commit ? st.s : before) / interval) };
    } else {
      result = {
        allowed: false,
        retryAfterMs: Math.ceil((need - st.s) / refillAmount),
        remaining: Math.floor(st.s / interval),
      };
    }
    if (commit) states.set(key, st);
    return result;
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset: (key) => states.delete(key),
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of [...states]) {
        if (refreshed(st, t).s >= cap) {
          states.delete(k);
          n++;
        }
      }
      return n;
    },
    size: () => states.size,
  };
}

export function createSlidingWindow(options) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const { limit, windowMs, now } = options;
  if (!isPosInt(limit) || !isPosInt(windowMs) || typeof now !== 'function') throw err('RL_INVALID_OPTIONS');
  const keys = new Map(); // key -> [{ t, cost }]

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function run(key, cost, commit) {
    cost = checkArgs(key, cost, limit);
    const t = now();
    const existing = keys.get(key);
    const events = existing ? live(existing, t) : [];
    if (existing) keys.set(key, events);
    const used = events.reduce((a, e) => a + e.cost, 0);
    if (used + cost <= limit) {
      if (commit) {
        if (!existing) keys.set(key, events);
        events.push({ t, cost });
        return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
    const target = used + cost - limit;
    let acc = 0;
    let retry = 0;
    for (const e of events) {
      acc += e.cost;
      if (acc >= target) {
        retry = Math.ceil(e.t + windowMs - t);
        break;
      }
    }
    return { allowed: false, retryAfterMs: retry, remaining: limit - used };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset: (key) => keys.delete(key),
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
