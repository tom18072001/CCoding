// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now / setTimeout / setInterval.

function rlError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function isPosInt(v) {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;
}

function checkKey(key) {
  if (typeof key !== 'string' || key === '') {
    throw rlError('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
  }
}

// Thứ tự: khóa → cost → cost so với sức chứa.
function checkInput(key, cost, capacity) {
  checkKey(key);
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw rlError('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  if (cost > capacity) throw rlError('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

function checkOptions(options, fields) {
  if (options === null || typeof options !== 'object') {
    throw rlError('RL_INVALID_OPTIONS', 'thiếu tùy chọn');
  }
  for (const f of fields) {
    if (!isPosInt(options[f])) throw rlError('RL_INVALID_OPTIONS', `${f} phải là số nguyên >= 1`);
  }
  if (typeof options.now !== 'function') {
    throw rlError('RL_INVALID_OPTIONS', 'now phải là hàm');
  }
}

export function createTokenBucket(options) {
  checkOptions(options, ['capacity']);
  const { capacity, now } = options;
  const refillAmount = options.refillAmount === undefined ? 1 : options.refillAmount;
  const refillIntervalMs = options.refillIntervalMs === undefined ? 1000 : options.refillIntervalMs;
  if (!isPosInt(refillAmount)) throw rlError('RL_INVALID_OPTIONS', 'refillAmount không hợp lệ');
  if (!isPosInt(refillIntervalMs)) throw rlError('RL_INVALID_OPTIONS', 'refillIntervalMs không hợp lệ');

  // Mọi lượng token được nhân với refillIntervalMs (số nguyên): mỗi ms thêm refillAmount.
  const I = BigInt(refillIntervalMs);
  const A = BigInt(refillAmount);
  const FULL = BigInt(capacity) * I;
  const keys = new Map(); // key -> { s: BigInt, last: number }

  // Trạng thái sau khi nạp bù tới now (không ghi vào map).
  function refreshed(st, t) {
    if (!st) return { s: FULL, last: t };
    if (t <= st.last) return { s: st.s, last: st.last }; // đồng hồ lùi/đứng yên: giữ mốc cũ
    let s = st.s + BigInt(t - st.last) * A;
    if (s > FULL) s = FULL;
    return { s, last: t };
  }

  function evaluate(st, cost) {
    const need = BigInt(cost) * I;
    if (st.s >= need) {
      return { allowed: true, next: st.s - need };
    }
    const deficit = need - st.s;
    const retry = Number((deficit + A - 1n) / A);
    return { allowed: false, retry, next: st.s };
  }

  return {
    take(key, cost) {
      cost = checkInput(key, cost, capacity);
      const st = refreshed(keys.get(key), now());
      const r = evaluate(st, cost);
      st.s = r.next;
      keys.set(key, st);
      return {
        allowed: r.allowed,
        retryAfterMs: r.allowed ? 0 : r.retry,
        remaining: Number(st.s / I),
      };
    },
    peek(key, cost) {
      cost = checkInput(key, cost, capacity);
      const st = refreshed(keys.get(key), now());
      const r = evaluate(st, cost);
      return {
        allowed: r.allowed,
        retryAfterMs: r.allowed ? 0 : r.retry,
        remaining: Number(st.s / I),
      };
    },
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of [...keys]) {
        if (refreshed(st, t).s >= FULL) {
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
  checkOptions(options, ['limit', 'windowMs']);
  const { limit, windowMs, now } = options;
  const keys = new Map(); // key -> [{ t, cost }] (cũ → mới)

  const live = (events, t) => events.filter((e) => e.t > t - windowMs);

  function evaluate(events, cost, t) {
    const used = events.reduce((a, e) => a + e.cost, 0);
    if (used + cost <= limit) return { allowed: true, used, retry: 0 };
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
    return { allowed: false, used, retry };
  }

  return {
    take(key, cost) {
      cost = checkInput(key, cost, limit);
      const t = now();
      const events = live(keys.get(key) || [], t);
      const r = evaluate(events, cost, t);
      if (r.allowed) {
        events.push({ t, cost });
        keys.set(key, events);
        return { allowed: true, retryAfterMs: 0, remaining: limit - r.used - cost };
      }
      if (keys.has(key)) keys.set(key, events);
      return { allowed: false, retryAfterMs: r.retry, remaining: limit - r.used };
    },
    peek(key, cost) {
      cost = checkInput(key, cost, limit);
      const t = now();
      const events = live(keys.get(key) || [], t);
      const r = evaluate(events, cost, t);
      return { allowed: r.allowed, retryAfterMs: r.retry, remaining: limit - r.used };
    },
    reset(key) {
      checkKey(key);
      return keys.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, events] of [...keys]) {
        const l = live(events, t);
        if (l.length === 0) {
          keys.delete(k);
          n++;
        } else {
          keys.set(k, l);
        }
      }
      return n;
    },
    size() {
      return keys.size;
    },
  };
}
