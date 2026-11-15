// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const isInt1 = (v) => Number.isInteger(v) && v >= 1;

function checkCommon(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
  if (cost === undefined) cost = 1;
  if (!isInt1(cost)) throw err('RL_INVALID_COST');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const { capacity, refillAmount = 1, refillIntervalMs = 1000, now } = options;
  if (!isInt1(capacity) || !isInt1(refillAmount) || !isInt1(refillIntervalMs) || typeof now !== 'function') {
    throw err('RL_INVALID_OPTIONS');
  }
  // Mọi lượng token được nhân với refillIntervalMs để dùng số nguyên.
  const cap = capacity * refillIntervalMs;
  const keys = new Map(); // key -> { tokens, last }

  function state(key, t) {
    const s = keys.get(key);
    if (!s) return { tokens: cap, last: t, exists: false };
    const dt = t > s.last ? t - s.last : 0;
    const tokens = Math.min(cap, s.tokens + dt * refillAmount);
    return { tokens, last: dt > 0 ? t : s.last, exists: true };
  }

  function run(key, cost, commit) {
    cost = checkCommon(key, cost, capacity);
    const t = now();
    const s = state(key, t);
    const need = cost * refillIntervalMs;
    if (s.tokens >= need) {
      const left = s.tokens - need;
      if (commit) keys.set(key, { tokens: left, last: s.last });
      // peek: chưa trừ cost
      const shown = commit ? left : s.tokens;
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(shown / refillIntervalMs) };
    }
    if (commit) keys.set(key, { tokens: s.tokens, last: s.last });
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - s.tokens) / refillAmount),
      remaining: Math.floor(s.tokens / refillIntervalMs),
    };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset(key) {
      if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const k of [...keys.keys()]) {
        if (state(k, t).tokens >= cap) {
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
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const { limit, windowMs, now } = options;
  if (!isInt1(limit) || !isInt1(windowMs) || typeof now !== 'function') throw err('RL_INVALID_OPTIONS');
  const keys = new Map(); // key -> [{t, cost}]

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function run(key, cost, commit) {
    cost = checkCommon(key, cost, limit);
    const t = now();
    const stored = keys.get(key);
    const events = stored ? live(stored, t) : [];
    if (stored && commit) keys.set(key, events);
    const used = events.reduce((a, e) => a + e.cost, 0);
    if (used + cost <= limit) {
      if (commit) {
        events.push({ t, cost });
        keys.set(key, events);
        return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
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
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset(key) {
      if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
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
    size: () => keys.size,
  };
}

export const ratelimit = { createTokenBucket, createSlidingWindow };
