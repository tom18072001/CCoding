// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now/setTimeout/setInterval.

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isInteger(v) && v >= 1;

function checkInput(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') {
    throw fail('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
  }
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw fail('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  if (cost > capacity) throw fail('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') {
    throw fail('RL_INVALID_OPTIONS', 'options bắt buộc');
  }
  for (const n of names) {
    if (!isPosInt(options[n])) throw fail('RL_INVALID_OPTIONS', `${n} phải là số nguyên >= 1`);
  }
  if (typeof options.now !== 'function') throw fail('RL_INVALID_OPTIONS', 'now phải là hàm');
}

export function createTokenBucket(options) {
  const opts = options === undefined || options === null ? options : { ...options };
  if (opts && opts.refillAmount === undefined) opts.refillAmount = 1;
  if (opts && opts.refillIntervalMs === undefined) opts.refillIntervalMs = 1000;
  checkOptions(opts, ['capacity', 'refillAmount', 'refillIntervalMs']);
  const { capacity, refillAmount, refillIntervalMs, now } = opts;
  // Mọi lượng token được nhân với refillIntervalMs để tính bằng số nguyên.
  const max = capacity * refillIntervalMs;
  const keys = new Map(); // key -> { units, last }

  // Trạng thái sau nạp bù (không ghi vào map).
  function project(state, t) {
    if (!state) return { units: max, last: t };
    if (t <= state.last) return { units: state.units, last: state.last };
    const units = Math.min(max, state.units + (t - state.last) * refillAmount);
    return { units, last: t };
  }

  function run(key, cost, commit) {
    cost = checkInput(key, cost, capacity);
    const s = project(keys.get(key), now());
    const need = cost * refillIntervalMs;
    if (s.units >= need) {
      const after = commit ? s.units - need : s.units;
      if (commit) {
        s.units = after;
        keys.set(key, s);
      }
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(after / refillIntervalMs) };
    }
    if (commit) keys.set(key, s);
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - s.units) / refillAmount),
      remaining: Math.floor(s.units / refillIntervalMs),
    };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset: (key) => keys.delete(key),
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of [...keys]) {
        if (project(st, t).units >= max) {
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

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function run(key, cost, commit) {
    cost = checkInput(key, cost, limit);
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
    if (commit && keys.has(key)) keys.set(key, events);
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
