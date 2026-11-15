// Module ratelimit — xem mục "Module ratelimit" trong SPEC.md.
// Đồng hồ chỉ đến từ tùy chọn `now`; không dùng Date.now / timer.

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const isPosInt = (v) => Number.isSafeInteger(v) && v >= 1;

function checkOptions(options, names) {
  if (options === null || typeof options !== 'object') {
    throw fail('RL_INVALID_OPTIONS', 'options phải là object');
  }
  for (const n of names) {
    if (!isPosInt(options[n])) throw fail('RL_INVALID_OPTIONS', `${n} phải là số nguyên >= 1`);
  }
  if (typeof options.now !== 'function') throw fail('RL_INVALID_OPTIONS', 'now phải là hàm');
}

function checkArgs(key, cost, capacity) {
  if (typeof key !== 'string' || key === '') throw fail('RL_INVALID_KEY', 'key phải là chuỗi không rỗng');
  if (cost === undefined) cost = 1;
  if (!isPosInt(cost)) throw fail('RL_INVALID_COST', 'cost phải là số nguyên >= 1');
  if (cost > capacity) throw fail('RL_COST_EXCEEDS_CAPACITY', 'cost vượt sức chứa');
  return cost;
}

export function createTokenBucket(options) {
  const opts = options === undefined ? undefined : options;
  if (opts === undefined || opts === null || typeof opts !== 'object') {
    throw fail('RL_INVALID_OPTIONS', 'options phải là object');
  }
  const o = { refillAmount: 1, refillIntervalMs: 1000, ...opts };
  // Tùy chọn undefined tường minh vẫn dùng mặc định.
  if (opts.refillAmount === undefined) o.refillAmount = 1;
  if (opts.refillIntervalMs === undefined) o.refillIntervalMs = 1000;
  checkOptions(o, ['capacity', 'refillAmount', 'refillIntervalMs']);
  const { capacity, refillAmount: A, refillIntervalMs: I, now } = o;
  const full = capacity * I; // token tính theo đơn vị 1/I để dùng số nguyên
  const keys = new Map(); // key -> { s, last }

  // Trả trạng thái đã nạp bù (không ghi vào map).
  function view(st, t) {
    if (t <= st.last) return { s: st.s, last: st.last };
    const s = Math.min(full, st.s + (t - st.last) * A);
    return { s, last: t };
  }

  function run(key, cost, commit) {
    cost = checkArgs(key, cost, capacity);
    const t = now();
    const st = keys.get(key) || { s: full, last: t };
    const v = view(st, t);
    const remainingNow = Math.floor(v.s / I);
    const need = cost * I;
    if (v.s >= need) {
      if (!commit) return { allowed: true, retryAfterMs: 0, remaining: remainingNow };
      v.s -= need;
      keys.set(key, v);
      return { allowed: true, retryAfterMs: 0, remaining: Math.floor(v.s / I) };
    }
    if (commit) keys.set(key, v); // từ chối không tiêu gì, nhưng mốc nạp được cập nhật
    return { allowed: false, retryAfterMs: Math.ceil((need - v.s) / A), remaining: remainingNow };
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
      for (const [k, st] of keys) {
        if (view(st, t).s >= full) {
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
  const { limit, windowMs: W, now } = options;
  const keys = new Map(); // key -> [{ t, cost }]

  const prune = (ev, t) => {
    let i = 0;
    while (i < ev.length && ev[i].t <= t - W) i++;
    if (i > 0) ev.splice(0, i);
  };

  function run(key, cost, commit) {
    cost = checkArgs(key, cost, limit);
    const t = now();
    const ev = keys.get(key) || [];
    prune(ev, t);
    let used = 0;
    for (const e of ev) used += e.cost;
    const remainingNow = limit - used;
    if (used + cost <= limit) {
      if (!commit) return { allowed: true, retryAfterMs: 0, remaining: remainingNow };
      ev.push({ t, cost });
      keys.set(key, ev);
      return { allowed: true, retryAfterMs: 0, remaining: limit - used - cost };
    }
    if (commit && keys.has(key) && ev.length === 0) keys.delete(key);
    const target = used + cost - limit;
    let acc = 0;
    let retry = 0;
    for (const e of ev) {
      acc += e.cost;
      if (acc >= target) {
        retry = Math.ceil(e.t + W - t);
        break;
      }
    }
    return { allowed: false, retryAfterMs: retry, remaining: remainingNow };
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
        prune(ev, t);
        if (ev.length === 0) {
          keys.delete(k);
          n++;
        }
      }
      return n;
    },
    size: () => keys.size,
  };
}
