// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
const isPosInt = (v) => isInt(v) && v >= 1;

function checkInput(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw err('RL_INVALID_COST');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

function readOptions(options, spec) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const out = {};
  for (const [name, def] of Object.entries(spec)) {
    const v = options[name] === undefined ? def : options[name];
    if (!isPosInt(v)) throw err('RL_INVALID_OPTIONS');
    out[name] = v;
  }
  if (typeof options.now !== 'function') throw err('RL_INVALID_OPTIONS');
  out.now = options.now;
  return out;
}

export function createTokenBucket(options) {
  const { capacity, refillAmount, refillIntervalMs, now } = readOptions(options, {
    capacity: undefined,
    refillAmount: 1,
    refillIntervalMs: 1000,
  });
  // Mọi lượng token được nhân với refillIntervalMs để dùng số nguyên.
  const cap = capacity * refillIntervalMs;
  const keys = new Map(); // key -> { v, t }

  function current(st, n) {
    if (!st) return { v: cap, t: n };
    if (n <= st.t) return { v: st.v, t: st.t };
    return { v: Math.min(cap, st.v + (n - st.t) * refillAmount), t: n };
  }

  function run(key, cost, commit) {
    cost = checkInput(key, cost, capacity);
    const n = now();
    const st = current(keys.get(key), n);
    const need = cost * refillIntervalMs;
    if (st.v >= need) {
      const after = commit ? st.v - need : st.v;
      if (commit) keys.set(key, { v: after, t: st.t });
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(after / refillIntervalMs) };
    }
    if (commit) keys.set(key, st);
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - st.v) / refillAmount),
      remaining: Math.floor(st.v / refillIntervalMs),
    };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset: (key) => {
      if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
      return keys.delete(key);
    },
    sweep() {
      const n = now();
      let removed = 0;
      for (const [k, st] of [...keys]) {
        if (current(st, n).v >= cap) {
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
  const { limit, windowMs, now } = readOptions(options, { limit: undefined, windowMs: undefined });
  const keys = new Map(); // key -> [{ t, cost }]

  const live = (events, n) => events.filter((e) => e.t > n - windowMs);

  function run(key, cost, commit) {
    cost = checkInput(key, cost, limit);
    const n = now();
    const events = live(keys.get(key) || [], n);
    const used = events.reduce((s, e) => s + e.cost, 0);
    if (used + cost <= limit) {
      if (commit) {
        events.push({ t: n, cost });
        keys.set(key, events);
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used - (commit ? cost : 0) };
    }
    if (commit && keys.has(key)) keys.set(key, events);
    const target = used + cost - limit;
    let acc = 0;
    let retry = 0;
    for (const e of events) {
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
    reset: (key) => {
      if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
      return keys.delete(key);
    },
    sweep() {
      const n = now();
      let removed = 0;
      for (const [k, events] of [...keys]) {
        const l = live(events, n);
        if (l.length === 0) {
          keys.delete(k);
          removed++;
        } else keys.set(k, l);
      }
      return removed;
    },
    size: () => keys.size,
  };
}
