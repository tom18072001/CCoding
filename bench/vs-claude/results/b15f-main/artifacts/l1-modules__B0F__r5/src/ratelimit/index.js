// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isInteger(v) && v >= 1;

function checkKeyCost(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw err('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS', 'thiếu tùy chọn');
  if (typeof options.now !== 'function') throw err('RL_INVALID_OPTIONS', 'now phải là hàm');
  for (const n of names) {
    if (!isPosInt(options[n])) throw err('RL_INVALID_OPTIONS', `${n} phải là số nguyên >= 1`);
  }
}

export function createTokenBucket(options) {
  if (options !== null && typeof options === 'object') {
    options = {
      ...options,
      refillAmount: options.refillAmount === undefined ? 1 : options.refillAmount,
      refillIntervalMs: options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs,
    };
  }
  checkOptions(options, ['capacity', 'refillAmount', 'refillIntervalMs']);
  const { capacity, refillAmount, refillIntervalMs, now } = options;
  // Token được nhân với refillIntervalMs để dùng số nguyên.
  const maxUnits = capacity * refillIntervalMs;
  const keys = new Map(); // key -> { units, last }

  function current(state, t) {
    const dt = t > state.last ? t - state.last : 0;
    const units = Math.min(maxUnits, state.units + dt * refillAmount);
    return { units, last: t > state.last ? t : state.last };
  }

  function run(key, cost, commit) {
    cost = checkKeyCost(key, cost, capacity);
    const t = now();
    const existing = keys.get(key);
    const cur = existing ? current(existing, t) : { units: maxUnits, last: t };
    const need = cost * refillIntervalMs;
    const allowed = cur.units >= need;
    let units = cur.units;
    if (commit) {
      if (allowed) units -= need;
      keys.set(key, { units, last: cur.last });
    }
    return {
      allowed,
      retryAfterMs: allowed ? 0 : Math.ceil((need - cur.units) / refillAmount),
      remaining: Math.floor(units / refillIntervalMs),
    };
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
      for (const [k, s] of keys) {
        if (current(s, t).units >= maxUnits) {
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

  function live(events, t) {
    const cutoff = t - windowMs;
    let i = 0;
    while (i < events.length && events[i].t <= cutoff) i++;
    if (i > 0) events.splice(0, i);
    return events;
  }

  function run(key, cost, commit) {
    cost = checkKeyCost(key, cost, limit);
    const t = now();
    const events = keys.has(key) ? live(keys.get(key), t) : [];
    const used = events.reduce((s, e) => s + e.cost, 0);
    const allowed = used + cost <= limit;
    let retryAfterMs = 0;
    if (!allowed) {
      const goal = used + cost - limit;
      let acc = 0;
      for (const e of events) {
        acc += e.cost;
        if (acc >= goal) {
          retryAfterMs = Math.ceil(e.t + windowMs - t);
          break;
        }
      }
    }
    if (commit && allowed) {
      events.push({ t, cost });
      keys.set(key, events);
    }
    const usedAfter = commit && allowed ? used + cost : used;
    return { allowed, retryAfterMs, remaining: limit - usedAfter };
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
      for (const [k, ev] of keys) {
        if (live(ev, t).length === 0) {
          keys.delete(k);
          n++;
        }
      }
      return n;
    },
    size: () => keys.size,
  };
}
