// ratelimit — xem SPEC.md, mục "Module ratelimit".

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const posInt = (x) => typeof x === 'number' && Number.isSafeInteger(x) && x >= 1;

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
}

function checkCost(cost, capacity) {
  if (cost === undefined) cost = 1;
  if (typeof cost !== 'number' || !Number.isSafeInteger(cost) || cost < 1) throw err('RL_INVALID_COST');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

function readOptions(options) {
  if (typeof options !== 'object' || options === null || typeof options.now !== 'function') {
    throw err('RL_INVALID_OPTIONS');
  }
  return options;
}

export function createTokenBucket(options) {
  const o = readOptions(options);
  const { capacity, now } = o;
  const refillAmount = o.refillAmount === undefined ? 1 : o.refillAmount;
  const refillIntervalMs = o.refillIntervalMs === undefined ? 1000 : o.refillIntervalMs;
  if (!posInt(capacity) || !posInt(refillAmount) || !posInt(refillIntervalMs)) throw err('RL_INVALID_OPTIONS');

  // Token được lưu nhân với refillIntervalMs (BigInt) để tính chính xác.
  const I = BigInt(refillIntervalMs);
  const A = BigInt(refillAmount);
  const CAP = BigInt(capacity) * I;
  const states = new Map(); // key → { s, t }

  const tick = () => Math.floor(now());

  function refilled(st, t) {
    if (t <= st.t) return { s: st.s, t: st.t };
    const s = st.s + BigInt(t - st.t) * A;
    return { s: s > CAP ? CAP : s, t };
  }

  function attempt(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, capacity);
    const t = tick();
    const cur = states.get(key) || { s: CAP, t };
    const st = refilled(cur, t);
    const need = BigInt(cost) * I;
    if (st.s >= need) {
      if (commit) {
        st.s -= need;
        states.set(key, st);
        return { allowed: true, retryAfterMs: 0, remaining: Number(st.s / I) };
      }
      return { allowed: true, retryAfterMs: 0, remaining: Number(st.s / I) };
    }
    if (commit) states.set(key, st);
    const wait = (need - st.s + A - 1n) / A;
    return { allowed: false, retryAfterMs: Number(wait), remaining: Number(st.s / I) };
  }

  return {
    take: (key, cost) => attempt(key, cost, true),
    peek: (key, cost) => attempt(key, cost, false),
    reset: (key) => states.delete(key),
    sweep() {
      const t = tick();
      let n = 0;
      for (const [k, st] of states) {
        if (refilled(st, t).s >= CAP) {
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
  const o = readOptions(options);
  const { limit, windowMs, now } = o;
  if (!posInt(limit) || !posInt(windowMs)) throw err('RL_INVALID_OPTIONS');
  const events = new Map(); // key → [{ t, cost }]

  const live = (list, t) => list.filter((e) => e.t > t - windowMs);

  function attempt(key, cost, commit) {
    checkKey(key);
    cost = checkCost(cost, limit);
    const t = now();
    const list = live(events.get(key) || [], t);
    const used = list.reduce((x, e) => x + e.cost, 0);
    if (used + cost <= limit) {
      if (commit) {
        list.push({ t, cost });
        events.set(key, list);
        return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
    if (commit && events.has(key)) events.set(key, list);
    const need = used + cost - limit;
    let cum = 0;
    let retry = 0;
    for (const e of list) {
      cum += e.cost;
      if (cum >= need) {
        retry = Math.ceil(e.t + windowMs - t);
        break;
      }
    }
    return { allowed: false, retryAfterMs: retry, remaining: limit - used };
  }

  return {
    take: (key, cost) => attempt(key, cost, true),
    peek: (key, cost) => attempt(key, cost, false),
    reset: (key) => events.delete(key),
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, list] of events) {
        const l = live(list, t);
        if (l.length === 0) {
          events.delete(k);
          n++;
        } else events.set(k, l);
      }
      return n;
    },
    size: () => events.size,
  };
}
