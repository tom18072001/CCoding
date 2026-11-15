function mkErr(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}
const isPosInt = (x) => Number.isSafeInteger(x) && x >= 1;

function checkArgs(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw mkErr('RL_INVALID_KEY');
  const c = cost === undefined ? 1 : cost;
  if (!isPosInt(c)) throw mkErr('RL_INVALID_COST');
  if (c > capacity) throw mkErr('RL_COST_EXCEEDS_CAPACITY');
  return c;
}

export function createTokenBucket(options) {
  if (typeof options !== 'object' || options === null) throw mkErr('RL_INVALID_OPTIONS');
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const refillIntervalMs = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!isPosInt(capacity) || !isPosInt(refillAmount) || !isPosInt(refillIntervalMs) || typeof now !== 'function') {
    throw mkErr('RL_INVALID_OPTIONS');
  }
  const cap = BigInt(capacity) * BigInt(refillIntervalMs); // scaled by interval
  const amt = BigInt(refillAmount);
  const itv = BigInt(refillIntervalMs);
  const keys = new Map(); // key -> { s: BigInt scaled tokens, last: number }

  // returns the state refilled to time t (does not store)
  function refilled(st, t) {
    if (t <= st.last) return { s: st.s, last: st.last };
    let s = st.s + BigInt(t - st.last) * amt;
    if (s > cap) s = cap;
    return { s, last: t };
  }

  function attempt(key, cost, commit) {
    const t = now();
    const existing = keys.get(key);
    const st = refilled(existing || { s: cap, last: t }, t);
    const need = BigInt(cost) * itv;
    if (st.s >= need) {
      if (commit) {
        st.s -= need;
        keys.set(key, st);
      }
      return { allowed: true, retryAfterMs: 0, remaining: Number(st.s / itv) };
    }
    if (commit) keys.set(key, st);
    const deficit = need - st.s;
    const retry = Number((deficit + amt - 1n) / amt);
    return { allowed: false, retryAfterMs: retry, remaining: Number(st.s / itv) };
  }

  return {
    take(key, cost) {
      const c = checkArgs(key, cost, capacity);
      return attempt(key, c, true);
    },
    peek(key, cost) {
      const c = checkArgs(key, cost, capacity);
      return attempt(key, c, false);
    },
    reset(key) {
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of [...keys]) {
        if (refilled(st, t).s >= cap) {
          keys.delete(k);
          n++;
        }
      }
      return n;
    },
    size() {
      return keys.size;
    },
  };
}

export function createSlidingWindow(options) {
  if (typeof options !== 'object' || options === null) throw mkErr('RL_INVALID_OPTIONS');
  const { limit, windowMs, now } = options;
  if (!isPosInt(limit) || !isPosInt(windowMs) || typeof now !== 'function') throw mkErr('RL_INVALID_OPTIONS');
  const keys = new Map(); // key -> [{t, cost}]

  function live(events, t) {
    return events.filter((e) => e.t > t - windowMs);
  }

  function attempt(key, cost, commit) {
    const t = now();
    const events = live(keys.get(key) || [], t);
    const used = events.reduce((a, e) => a + e.cost, 0);
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
    let acc = 0;
    let retry = 0;
    for (const e of events) {
      acc += e.cost;
      if (acc >= need) {
        retry = Math.ceil(e.t + windowMs - t);
        break;
      }
    }
    return { allowed: false, retryAfterMs: retry, remaining: limit - used };
  }

  return {
    take(key, cost) {
      const c = checkArgs(key, cost, limit);
      return attempt(key, c, true);
    },
    peek(key, cost) {
      const c = checkArgs(key, cost, limit);
      return attempt(key, c, false);
    },
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
    size() {
      return keys.size;
    },
  };
}
