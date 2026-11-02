// Lời giải tham chiếu module ratelimit. Đồng hồ chỉ qua options.now.

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function posInt(v) {
  return Number.isInteger(v) && v >= 1;
}

function checkKey(key) {
  if (typeof key !== 'string' || key === '') throw fail('RL_INVALID_KEY', 'Khóa phải là chuỗi không rỗng');
}

function checkCost(cost, capacity) {
  const c = cost === undefined ? 1 : cost;
  if (!posInt(c)) throw fail('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  if (c > capacity) throw fail('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return c;
}

export function createTokenBucket(options) {
  const o = options || {};
  const { capacity, refillAmount = 1, refillIntervalMs = 1000, now } = o;
  if (!posInt(capacity) || !posInt(refillAmount) || !posInt(refillIntervalMs) || typeof now !== 'function') {
    throw fail('RL_INVALID_OPTIONS', 'Tùy chọn không hợp lệ');
  }
  const capU = capacity * refillIntervalMs; // mọi lượng token nhân refillIntervalMs để tính số nguyên
  const states = new Map();

  function level(st, t) {
    return Math.min(capU, st.level + Math.max(0, t - st.last) * refillAmount);
  }

  function run(key, cost, consume) {
    checkKey(key);
    const c = checkCost(cost, capacity);
    const t = now();
    const st = states.get(key);
    let lv = st ? level(st, t) : capU;
    const last = st ? Math.max(st.last, t) : t;
    const costU = c * refillIntervalMs;
    const allowed = lv >= costU;
    let retryAfterMs = 0;
    if (!allowed) retryAfterMs = Math.ceil((costU - lv) / refillAmount);
    if (consume) {
      if (allowed) lv -= costU;
      states.set(key, { level: lv, last });
    }
    return { allowed, retryAfterMs, remaining: Math.floor(lv / refillIntervalMs) };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek(key, cost) {
      const r = run(key, cost, false);
      // peek: remaining là số hiện tại, chưa trừ cost (run không trừ khi consume=false)
      return r;
    },
    reset: (key) => states.delete(key),
    size: () => states.size,
    sweep() {
      const t = now();
      let n = 0;
      for (const [k, st] of states) {
        if (level(st, t) >= capU) {
          states.delete(k);
          n++;
        }
      }
      return n;
    },
  };
}

export function createSlidingWindow(options) {
  const o = options || {};
  const { limit, windowMs, now } = o;
  if (!posInt(limit) || !posInt(windowMs) || typeof now !== 'function') {
    throw fail('RL_INVALID_OPTIONS', 'Tùy chọn không hợp lệ');
  }
  const events = new Map();

  function live(list, t) {
    return list.filter((e) => e.t > t - windowMs);
  }

  function run(key, cost, consume) {
    checkKey(key);
    const c = checkCost(cost, limit);
    const t = now();
    const list = live(events.get(key) || [], t);
    const used = list.reduce((s, e) => s + e.cost, 0);
    const allowed = used + c <= limit;
    let retryAfterMs = 0;
    if (!allowed) {
      const need = used + c - limit;
      let acc = 0;
      for (const e of list) {
        acc += e.cost;
        if (acc >= need) {
          retryAfterMs = Math.ceil(e.t + windowMs - t);
          break;
        }
      }
    }
    if (consume) {
      if (allowed) list.push({ t, cost: c });
      events.set(key, list);
    }
    const remaining = consume && allowed ? limit - used - c : limit - used;
    return { allowed, retryAfterMs, remaining };
  }

  return {
    take: (key, cost) => run(key, cost, true),
    peek: (key, cost) => run(key, cost, false),
    reset: (key) => events.delete(key),
    size: () => events.size,
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
  };
}
