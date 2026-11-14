// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isInteger(v) && v >= 1;

function checkOptions(options, fields) {
  if (options === null || typeof options !== 'object') {
    throw err('RL_INVALID_OPTIONS', 'tùy chọn phải là đối tượng');
  }
  for (const f of fields) {
    if (!isPosInt(options[f])) throw err('RL_INVALID_OPTIONS', `${f} phải là số nguyên >= 1`);
  }
  if (typeof options.now !== 'function') throw err('RL_INVALID_OPTIONS', 'now phải là hàm');
}

function checkArgs(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw err('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') {
    throw err('RL_INVALID_OPTIONS', 'tùy chọn phải là đối tượng');
  }
  const opts = {
    capacity: options.capacity,
    refillAmount: options.refillAmount === undefined ? 1 : options.refillAmount,
    refillIntervalMs: options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs,
    now: options.now,
  };
  checkOptions(opts, ['capacity', 'refillAmount', 'refillIntervalMs']);
  const { capacity, refillAmount, refillIntervalMs, now } = opts;
  const max = capacity * refillIntervalMs; // token nhân refillIntervalMs
  const states = new Map(); // key -> { tokens, last }

  // trả trạng thái đã nạp bù (không ghi vào map)
  function view(key) {
    const t = now();
    const s = states.get(key);
    if (!s) return { tokens: max, last: t, exists: false };
    const elapsed = t > s.last ? t - s.last : 0;
    const tokens = Math.min(max, s.tokens + elapsed * refillAmount);
    return { tokens, last: t > s.last ? t : s.last, exists: true };
  }

  function run(key, cost, commit) {
    cost = checkArgs(key, cost, capacity);
    const v = view(key);
    const need = cost * refillIntervalMs;
    if (v.tokens >= need) {
      const after = commit ? v.tokens - need : v.tokens;
      if (commit) states.set(key, { tokens: after, last: v.last });
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(after / refillIntervalMs) };
    }
    if (commit) states.set(key, { tokens: v.tokens, last: v.last });
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - v.tokens) / refillAmount),
      remaining: Math.floor(v.tokens / refillIntervalMs),
    };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset(key) {
      if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
      return states.delete(key);
    },
    sweep() {
      let n = 0;
      for (const key of [...states.keys()]) {
        if (view(key).tokens >= max) {
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
  const events = new Map(); // key -> [{t, cost}]

  function live(list, t) {
    return list.filter((e) => e.t > t - windowMs);
  }

  function run(key, cost, commit) {
    cost = checkArgs(key, cost, limit);
    const t = now();
    const list = live(events.get(key) || [], t);
    const used = list.reduce((a, e) => a + e.cost, 0);
    if (used + cost <= limit) {
      if (commit) {
        list.push({ t, cost });
        events.set(key, list);
      } else if (events.has(key)) {
        events.set(key, list);
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used - (commit ? cost : 0) };
    }
    if (events.has(key)) events.set(key, list);
    const target = used + cost - limit;
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
      if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
      return events.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [key, list] of [...events]) {
        const l = live(list, t);
        if (l.length === 0) {
          events.delete(key);
          n++;
        } else events.set(key, l);
      }
      return n;
    },
    size: () => events.size,
  };
}
