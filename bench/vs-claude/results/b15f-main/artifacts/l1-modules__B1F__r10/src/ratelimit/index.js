// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng đồng hồ thật hay bộ hẹn giờ.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const isPosInt = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1;

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  for (const n of names) if (!isPosInt(options[n])) throw err('RL_INVALID_OPTIONS');
  if (typeof options.now !== 'function') throw err('RL_INVALID_OPTIONS');
}

// Thứ tự: khóa → cost → cost so với sức chứa.
function checkInput(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw err('RL_INVALID_COST');
  if (cost > capacity) throw err('RL_COST_EXCEEDS_CAPACITY');
  return cost;
}

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw err('RL_INVALID_KEY');
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') throw err('RL_INVALID_OPTIONS');
  const opts = { ...options };
  if (opts.refillAmount === undefined) opts.refillAmount = 1;
  if (opts.refillIntervalMs === undefined) opts.refillIntervalMs = 1000;
  checkOptions(opts, ['capacity', 'refillAmount', 'refillIntervalMs']);
  const { capacity, refillAmount, refillIntervalMs, now } = opts;
  // Mọi lượng token được nhân với refillIntervalMs để dùng số nguyên.
  const maxUnits = capacity * refillIntervalMs;
  const buckets = new Map(); // key -> { units, last }

  // Trạng thái đã nạp bù tại thời điểm t (không sửa bucket gốc).
  function refilled(b, t) {
    if (!b) return { units: maxUnits, last: t };
    if (t <= b.last) return { units: b.units, last: b.last }; // đồng hồ lùi/đứng yên
    const units = Math.min(maxUnits, b.units + (t - b.last) * refillAmount);
    return { units, last: t };
  }

  function evaluate(key, cost, commit) {
    cost = checkInput(key, cost, capacity);
    const t = now();
    const s = refilled(buckets.get(key), t);
    const need = cost * refillIntervalMs;
    if (s.units >= need) {
      if (commit) {
        const after = s.units - need;
        buckets.set(key, { units: after, last: s.last });
        return { allowed: true, retryAfterMs: 0, remaining: Math.floor(after / refillIntervalMs) };
      }
      // peek: số còn lại hiện tại (chưa trừ cost)
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(s.units / refillIntervalMs) };
    }
    if (commit) buckets.set(key, s);
    return {
      allowed: false,
      retryAfterMs: Math.ceil((need - s.units) / refillAmount),
      remaining: Math.floor(s.units / refillIntervalMs),
    };
  }

  return {
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset(key) {
      checkKey(key);
      return buckets.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, b] of [...buckets]) {
        if (refilled(b, t).units >= maxUnits) {
          buckets.delete(k);
          n++;
        }
      }
      return n;
    },
    size: () => buckets.size,
  };
}

export function createSlidingWindow(options) {
  checkOptions(options, ['limit', 'windowMs']);
  const { limit, windowMs, now } = options;
  const keys = new Map(); // key -> [{ t, cost }]

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function evaluate(key, cost, commit) {
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
    if (commit) keys.set(key, events);
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
    take: (key, cost) => evaluate(key, cost, true),
    peek: (key, cost) => evaluate(key, cost, false),
    reset(key) {
      checkKey(key);
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
