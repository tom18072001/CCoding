// Module ratelimit: token bucket và cửa sổ trượt. Đồng hồ chỉ đến từ tùy chọn `now`.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function isPosInt(v) {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;
}

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  if (typeof options.now !== 'function') throw err('RL_INVALID_OPTIONS');
  for (const n of names) {
    if (!isPosInt(options[n])) throw err('RL_INVALID_OPTIONS', n);
  }
}

// Thứ tự: khóa -> cost -> cost so với sức chứa
function checkInput(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
  const c = cost === undefined ? 1 : cost;
  if (!isPosInt(c)) throw err('RL_INVALID_COST');
  if (c > capacity) throw err('RL_COST_EXCEEDS_CAPACITY');
  return c;
}

export function createTokenBucket(options) {
  if (options !== null && typeof options === 'object' && options.refillAmount === undefined) {
    options = { ...options, refillAmount: 1 };
  }
  if (options !== null && typeof options === 'object' && options.refillIntervalMs === undefined) {
    options = { ...options, refillIntervalMs: 1000 };
  }
  checkOptions(options, ['capacity', 'refillAmount', 'refillIntervalMs']);
  const { capacity, refillAmount, refillIntervalMs, now } = options;
  // token được lưu theo đơn vị nhân với refillIntervalMs (số nguyên chính xác)
  const max = BigInt(capacity) * BigInt(refillIntervalMs);
  const amt = BigInt(refillAmount);
  const itv = BigInt(refillIntervalMs);
  const keys = new Map(); // key -> { scaled: bigint, last: number }

  function current(state, t) {
    let scaled = state.scaled;
    let last = state.last;
    if (t > last) {
      scaled += BigInt(t - last) * amt;
      if (scaled > max) scaled = max;
      last = t;
    }
    return { scaled, last };
  }

  function run(key, cost, commit) {
    const c = checkInput(key, cost, capacity);
    const t = now();
    const existing = keys.get(key);
    const cur = existing ? current(existing, t) : { scaled: max, last: t };
    const need = BigInt(c) * itv;
    let res;
    if (cur.scaled >= need) {
      const after = commit ? cur.scaled - need : cur.scaled;
      res = {
        allowed: true,
        retryAfterMs: 0,
        remaining: Number((commit ? after : cur.scaled) / itv),
      };
      if (commit) keys.set(key, { scaled: after, last: cur.last });
    } else {
      const deficit = need - cur.scaled;
      const retry = Number((deficit + amt - 1n) / amt);
      res = { allowed: false, retryAfterMs: retry, remaining: Number(cur.scaled / itv) };
      if (commit) keys.set(key, { scaled: cur.scaled, last: cur.last });
    }
    return res;
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
      for (const [k, s] of [...keys]) {
        if (current(s, t).scaled >= max) {
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
  const keys = new Map(); // key -> [{t, cost}]

  function prune(events, t) {
    let i = 0;
    while (i < events.length && !(events[i].t > t - windowMs)) i++;
    if (i > 0) events.splice(0, i);
  }

  function run(key, cost, commit) {
    const c = checkInput(key, cost, limit);
    const t = now();
    let events = keys.get(key);
    if (events) prune(events, t);
    const list = events || [];
    let used = 0;
    for (const e of list) used += e.cost;
    if (used + c <= limit) {
      if (commit) {
        if (!events) keys.set(key, list);
        list.push({ t, cost: c });
        return { allowed: true, retryAfterMs: 0, remaining: limit - used - c };
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
    const target = used + c - limit;
    let acc = 0;
    let retry = 0;
    for (const e of list) {
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
    reset(key) {
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, events] of [...keys]) {
        prune(events, t);
        if (events.length === 0) {
          keys.delete(k);
          n++;
        }
      }
      return n;
    },
    size: () => keys.size,
  };
}
