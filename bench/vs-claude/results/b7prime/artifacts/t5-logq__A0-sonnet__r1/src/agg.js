'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function bad(spec) {
  return new Error('invalid aggregation: ' + (typeof spec === 'string' ? spec.trim() : String(spec)));
}

function toNum(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function numbers(records, f) {
  const out = [];
  for (const r of records) {
    if (!Object.prototype.hasOwnProperty.call(r, f)) continue;
    const n = toNum(r[f]);
    if (n !== null) out.push(n);
  }
  return out;
}

function buckets(records, f) {
  const map = new Map();
  for (const r of records) {
    if (!Object.prototype.hasOwnProperty.call(r, f)) continue;
    const v = r[f];
    if (v === null || v === undefined) continue;
    const mk = typeof v === 'object' ? 'o:' + JSON.stringify(v) : typeof v + ':' + String(v);
    const b = map.get(mk);
    if (b) b.count++;
    else map.set(mk, { key: v, count: 1 });
  }
  const arr = [...map.values()];
  arr.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key), y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return arr;
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw bad(spec);
  const parts = spec.trim().split(/\s+/);
  const kind = parts[0];
  const argc = parts.length;
  if (kind === 'count') {
    if (argc === 1) return { type: 'count', value: records.length };
    if (argc === 3 && parts[1] === 'by') {
      return { type: 'count_by', field: parts[2], buckets: buckets(records, parts[2]) };
    }
    throw bad(spec);
  }
  if (kind === 'top') {
    if (argc !== 3 || !/^\d+$/.test(parts[1]) || Number(parts[1]) < 1) throw bad(spec);
    return { type: 'top', field: parts[2], buckets: buckets(records, parts[2]).slice(0, Number(parts[1])) };
  }
  if (kind === 'sum' || kind === 'avg' || kind === 'min' || kind === 'max') {
    if (argc !== 2) throw bad(spec);
    const f = parts[1];
    const nums = numbers(records, f);
    let value = null;
    if (nums.length) {
      if (kind === 'sum') value = nums.reduce((a, b) => a + b, 0);
      else if (kind === 'avg') value = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1e4) / 1e4;
      else if (kind === 'min') value = nums.reduce((a, b) => (b < a ? b : a));
      else value = nums.reduce((a, b) => (b > a ? b : a));
    }
    return { type: kind, field: f, value };
  }
  if (/^p(50|90|95|99)$/.test(kind)) {
    if (argc !== 2) throw bad(spec);
    const f = parts[1];
    const nums = numbers(records, f).sort((a, b) => a - b);
    let value = null;
    if (nums.length) {
      const rank = Math.max(1, Math.ceil((Number(kind.slice(1)) / 100) * nums.length));
      value = nums[rank - 1];
    }
    return { type: kind, field: f, value };
  }
  if (kind === 'histogram') {
    const m = argc === 2 ? /^([1-9]\d*)([smhd])$/.exec(parts[1]) : null;
    if (!m) throw bad(spec);
    const step = Number(m[1]) * UNIT[m[2]];
    const counts = new Map();
    let lo = Infinity, hi = -Infinity;
    for (const r of records) {
      const t = r['@t'];
      if (typeof t !== 'number' || !Number.isFinite(t)) continue;
      const b = Math.floor(t / step) * step;
      counts.set(b, (counts.get(b) || 0) + 1);
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    const out = [];
    if (counts.size) {
      for (let b = lo; b <= hi; b += step) {
        out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
      }
    }
    return { type: 'histogram', interval: parts[1], buckets: out };
  }
  throw bad(spec);
}

module.exports = { aggregate };
