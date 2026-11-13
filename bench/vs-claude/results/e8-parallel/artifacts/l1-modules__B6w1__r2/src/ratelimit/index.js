// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

const isPosInt = (v) => Number.isInteger(v) && v >= 1;

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw fail('RL_INVALID_KEY');
}

function checkCost(cost, max) {
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw fail('RL_INVALID_COST');
  if (cost > max) throw fail('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') throw fail('RL_INVALID_OPTIONS');
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const interval = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!isPosInt(capacity) || !isPosInt(refillAmount) || !isPosInt(interval) || typeof now !== 'function') {
    throw fail('RL_INVALID_OPTIONS');
  }
  // Token được nhân với interval để tính số nguyên.
  const max = capacity * interval;
  const states = new Map(); // key -> { tok, last }

  // Trả trạng thái đã nạp bù đến thời điểm n (không ghi vào map).
  function refilled(key, n) {
    const s = states.get(key);
    if (!s) return { tok: max, last: n, exists: false };
    const elapsed = n > s.last ? n - s.last : 0;
    return { tok: Math.min(max, s.tok + elapsed * refillAmount), last: Math.max(s.last, n), exists: true };
  }

  function run(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, capacity);
    const st = refilled(key, now());
    const need = cost * interval;
    if (st.tok >= need) {
      const tok = st.tok - need;
      if (commit) states.set(key, { tok, last: st.last });
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor((commit ? tok : st.tok) / interval) };
    }
    if (commit) states.set(key, { tok: st.tok, last: st.last });
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - st.tok) / refillAmount),
      remaining: Math.floor(st.tok / interval),
    };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset(key) {
      checkKey(key);
      return states.delete(key);
    },
    sweep() {
      const n = now();
      let removed = 0;
      for (const key of [...states.keys()]) {
        if (refilled(key, n).tok >= max) {
          states.delete(key);
          removed++;
        }
      }
      return removed;
    },
    size: () => states.size,
  };
}

export function createSlidingWindow(options) {
  if (options === null || typeof options !== 'object') throw fail('RL_INVALID_OPTIONS');
  const { limit, windowMs, now } = options;
  if (!isPosInt(limit) || !isPosInt(windowMs) || typeof now !== 'function') throw fail('RL_INVALID_OPTIONS');
  const events = new Map(); // key -> [{ t, cost }]

  const live = (list, n) => list.filter((e) => e.t > n - windowMs);

  function run(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, limit);
    const n = now();
    const list = live(events.get(key) || [], n);
    const used = list.reduce((a, e) => a + e.cost, 0);
    if (events.has(key)) events.set(key, list);
    if (used + cost <= limit) {
      if (commit) {
        list.push({ t: n, cost });
        events.set(key, list);
      }
      return { allowed: true, retryAfterMs: 0, remaining: commit ? limit - used - cost : limit - used };
    }
    const target = used + cost - limit;
    let acc = 0;
    let retry = 0;
    for (const e of list) {
      acc += e.cost;
      if (acc >= target) {
        retry = Math.ceil(e.t + windowMs - n);
        break;
      }
    }
    return { allowed: false, retryAfterMs: retry, remaining: limit - used };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset(key) {
      checkKey(key);
      return events.delete(key);
    },
    sweep() {
      const n = now();
      let removed = 0;
      for (const [key, list] of [...events]) {
        const l = live(list, n);
        if (l.length === 0) {
          events.delete(key);
          removed++;
        } else events.set(key, l);
      }
      return removed;
    },
    size: () => events.size,
  };
}
