// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now/setTimeout/setInterval.

function rlError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function isPosInt(v) {
  return Number.isInteger(v) && v >= 1;
}

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw rlError('RL_INVALID_KEY');
}

// Thứ tự: khóa → cost → cost so với sức chứa.
function checkArgs(key, cost, capacity) {
  checkKey(key);
  const c = cost === undefined ? 1 : cost;
  if (!isPosInt(c)) throw rlError('RL_INVALID_COST');
  if (c > capacity) throw rlError('RL_COST_EXCEEDS_CAPACITY');
  return c;
}

function checkNow(now) {
  if (typeof now !== 'function') throw rlError('RL_INVALID_OPTIONS');
}

export function createTokenBucket(options) {
  if (options === null || typeof options !== 'object') throw rlError('RL_INVALID_OPTIONS');
  const { capacity, refillAmount = 1, refillIntervalMs = 1000, now } = options;
  if (!isPosInt(capacity) || !isPosInt(refillAmount) || !isPosInt(refillIntervalMs)) {
    throw rlError('RL_INVALID_OPTIONS');
  }
  checkNow(now);

  const I = refillIntervalMs;
  const maxScaled = capacity * I; // token nhân với refillIntervalMs để dùng số nguyên
  const states = new Map(); // key -> { tok, last }

  // Trạng thái sau khi nạp bù đến thời điểm t (không ghi vào map).
  function refilled(st, t) {
    if (t <= st.last) return { tok: st.tok, last: st.last }; // đồng hồ lùi: giữ mốc cũ
    const elapsed = t - st.last;
    // tránh tràn số khi elapsed rất lớn
    const tok = elapsed >= maxScaled ? maxScaled : Math.min(maxScaled, st.tok + elapsed * refillAmount);
    return { tok, last: t };
  }

  function evaluate(key, c, commit) {
    const t = now();
    const existing = states.get(key);
    const st = existing ? refilled(existing, t) : { tok: maxScaled, last: t };
    if (st.tok >= c * I) {
      const after = { tok: st.tok - c * I, last: st.last };
      if (commit) states.set(key, after);
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(after.tok / I) };
    }
    if (commit) states.set(key, st); // từ chối không tiêu gì, nhưng mốc nạp được cập nhật
    return {
      allowed: false,
      retryAfterMs: Math.ceil((c * I - st.tok) / refillAmount),
      remaining: Math.floor(st.tok / I),
    };
  }

  return {
    take(key, cost) {
      const c = checkArgs(key, cost, capacity);
      return evaluate(key, c, true);
    },
    peek(key, cost) {
      const c = checkArgs(key, cost, capacity);
      const r = evaluate(key, c, false);
      // peek: remaining là số còn lại hiện tại (chưa trừ cost)
      if (r.allowed) {
        const t = now();
        const ex = states.get(key);
        const tok = ex ? refilled(ex, t).tok : maxScaled;
        r.remaining = Math.floor(tok / I);
      }
      return r;
    },
    reset(key) {
      checkKey(key);
      return states.delete(key);
    },
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of [...states]) {
        if (refilled(st, t).tok >= maxScaled) {
          states.delete(k);
          n++;
        }
      }
      return n;
    },
    size() {
      return states.size;
    },
  };
}

export function createSlidingWindow(options) {
  if (options === null || typeof options !== 'object') throw rlError('RL_INVALID_OPTIONS');
  const { limit, windowMs, now } = options;
  if (!isPosInt(limit) || !isPosInt(windowMs)) throw rlError('RL_INVALID_OPTIONS');
  checkNow(now);

  const keys = new Map(); // key -> [{ t, cost }] từ cũ đến mới

  function live(events, t) {
    // sự kiện còn hiệu lực khi ev.t > t - windowMs
    return events.filter((e) => e.t > t - windowMs);
  }

  function evaluate(key, c, commit) {
    const t = now();
    const events = live(keys.get(key) || [], t);
    const used = events.reduce((s, e) => s + e.cost, 0);
    if (used + c <= limit) {
      if (commit) {
        events.push({ t, cost: c });
        keys.set(key, events);
        return { allowed: true, retryAfterMs: 0, remaining: limit - used - c };
      }
      return { allowed: true, retryAfterMs: 0, remaining: limit - used };
    }
    if (commit && keys.has(key)) keys.set(key, events);
    const need = used + c - limit;
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
      return evaluate(key, c, true);
    },
    peek(key, cost) {
      const c = checkArgs(key, cost, limit);
      return evaluate(key, c, false);
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
