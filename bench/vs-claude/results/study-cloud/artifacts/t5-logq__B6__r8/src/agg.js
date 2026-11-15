'use strict';

function bad(spec) {
  return new Error('invalid aggregation: ' + String(spec));
}

function numVal(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return null;
}

function has(r, f) {
  return r !== null && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, f);
}

function numbers(recs, f) {
  const vals = [];
  for (const r of recs) {
    if (!has(r, f)) continue;
    const v = numVal(r[f]);
    if (v !== null) vals.push(v);
  }
  return vals;
}

function countBy(records, f) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, f)) continue;
    const v = r[f];
    if (v === null || v === undefined) continue;
    map.set(v, (map.get(v) || 0) + 1);
  }
  const buckets = [];
  for (const [key, count] of map) buckets.push({ key, count });
  buckets.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return buckets;
}

const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw bad(spec);
  const recs = Array.isArray(records) ? records : Array.from(records || []);
  const parts = spec.trim().split(/\s+/);
  const kw = parts[0];
  const n = parts.length;

  if (kw === 'count') {
    if (n === 1) return { type: 'count', value: recs.length };
    if (n === 3 && parts[1] === 'by') {
      return { type: 'count_by', field: parts[2], buckets: countBy(recs, parts[2]) };
    }
    throw bad(spec);
  }
  if (kw === 'top') {
    if (n !== 3 || !/^\d+$/.test(parts[1])) throw bad(spec);
    const k = Number(parts[1]);
    if (!Number.isSafeInteger(k) || k < 1) throw bad(spec);
    return { type: 'top', field: parts[2], buckets: countBy(recs, parts[2]).slice(0, k) };
  }
  if (kw === 'sum' || kw === 'avg' || kw === 'min' || kw === 'max') {
    if (n !== 2) throw bad(spec);
    const f = parts[1];
    const vals = numbers(recs, f);
    let value = null;
    if (vals.length) {
      if (kw === 'sum' || kw === 'avg') {
        let s = 0;
        for (const v of vals) s += v;
        value = kw === 'sum' ? s : Math.round((s / vals.length) * 1e4) / 1e4;
      } else {
        value = vals[0];
        for (const v of vals) if (kw === 'min' ? v < value : v > value) value = v;
      }
    }
    return { type: kw, field: f, value };
  }
  if (kw === 'p50' || kw === 'p90' || kw === 'p95' || kw === 'p99') {
    if (n !== 2) throw bad(spec);
    const f = parts[1];
    const p = Number(kw.slice(1));
    const vals = numbers(recs, f).sort((a, b) => a - b);
    let value = null;
    if (vals.length) {
      const rank = Math.max(1, Math.ceil((p / 100) * vals.length));
      value = vals[rank - 1];
    }
    return { type: kw, field: f, value };
  }
  if (kw === 'histogram') {
    const m = n === 2 ? /^(\d+)([smhd])$/.exec(parts[1]) : null;
    if (!m || !Number.isSafeInteger(Number(m[1])) || Number(m[1]) < 1) throw bad(spec);
    const step = Number(m[1]) * UNITS[m[2]];
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of recs) {
      if (!has(r, '@t')) continue;
      const t = r['@t'];
      if (typeof t !== 'number' || !Number.isFinite(t)) continue;
      const b = Math.floor(t / step) * step;
      counts.set(b, (counts.get(b) || 0) + 1);
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    const buckets = [];
    if (counts.size) {
      for (let b = lo; b <= hi; b += step) {
        buckets.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
      }
    }
    return { type: 'histogram', interval: parts[1], buckets };
  }
  throw bad(spec);
}

module.exports = { aggregate };
