// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function isPosInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1;
}

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') {
    throw err('RL_INVALID_OPTIONS', 'options phải là object');
  }
  for (const n of names) {
    if (!isPosInt(options[n])) throw err('RL_INVALID_OPTIONS', `${n} phải là số nguyên >= 1`);
  }
  if (typeof options.now !== 'function') throw err('RL_INVALID_OPTIONS', 'now phải là hàm');
}

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
}

function checkCost(cost, max) {
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw err('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  if (cost > max) throw err('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') {
    throw err('RL_INVALID_OPTIONS', 'options phải là object');
  }
  const A = options.refillAmount === undefined ? 1 : options.refillAmount;
  const I = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  checkOptions({ capacity: options.capacity, refillAmount: A, refillIntervalMs: I, now: options.now }, [
    'capacity',
    'refillAmount',
    'refillIntervalMs',
  ]);
  const { capacity, now } = options;
  const full = capacity * I; // mọi lượng token được nhân với I (số nguyên)
  const keys = new Map(); // key -> { s, last }

  function refilled(st, t) {
    if (t <= st.last) return st.s; // đồng hồ lùi / không trôi: không nạp
    return Math.min(full, st.s + (t - st.last) * A);
  }

  function run(key, cost, consume) {
    checkKey(key);
    cost = checkCost(cost, capacity);
    const t = now();
    const st = keys.get(key);
    const s = st ? refilled(st, t) : full;
    const need = cost * I;
    const ok = s >= need;
    const after = ok && consume ? s - need : s;
    if (consume) keys.set(key, { s: after, last: st ? Math.max(st.last, t) : t });
    return {
      allowed: ok,
      retryAfterMs: ok ? 0 : Math.ceil((need - s) / A),
      remaining: Math.floor(after / I),
    };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of keys) {
        if (refilled(st, t) >= full) {
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
  const keys = new Map(); // key -> [{ t, cost }]

  function prune(ev, t) {
    let i = 0;
    while (i < ev.length && !(ev[i].t > t - windowMs)) i++;
    if (i > 0) ev.splice(0, i);
  }

  function run(key, cost, consume) {
    checkKey(key);
    cost = checkCost(cost, limit);
    const t = now();
    const ev = keys.get(key);
    if (ev) prune(ev, t);
    const events = ev || [];
    let used = 0;
    for (const e of events) used += e.cost;
    if (used + cost <= limit) {
      if (consume) {
        if (ev) ev.push({ t, cost });
        else keys.set(key, [{ t, cost }]);
        used += cost;
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
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, ev] of keys) {
        prune(ev, t);
        if (ev.length === 0) {
          keys.delete(k);
          n++;
        }
      }
      return n;
    },
    size: () => keys.size,
  };
}
