'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec) {
  return new Error(`invalid aggregation: ${typeof spec === 'string' ? spec : String(spec)}`);
}

function parseSpec(spec) {
  if (typeof spec !== 'string') throw invalid(spec);
  const t = spec.trim().split(/\s+/);
  const op = t[0];
  if (op === 'count') {
    if (t.length === 1) return { op: 'count' };
    if (t.length === 3 && t[1] === 'by') return { op: 'count_by', field: t[2] };
  } else if (op === 'top') {
    if (t.length === 3 && /^\d+$/.test(t[1]) && Number(t[1]) >= 1) return { op: 'top', n: Number(t[1]), field: t[2] };
  } else if (['sum', 'avg', 'min', 'max'].includes(op)) {
    if (t.length === 2) return { op, field: t[1] };
  } else if (['p50', 'p90', 'p95', 'p99'].includes(op)) {
    if (t.length === 2) return { op, field: t[1], p: Number(op.slice(1)) };
  } else if (op === 'histogram') {
    // "k" trong đặc tả là số nguyên ≥ 1, đơn vị u ∈ s/m/h/d
    const m = t.length === 2 && /^(\d+)([smhd])$/.exec(t[1]);
    if (m && Number(m[1]) >= 1) return { op, k: Number(m[1]), u: m[2] };
  }
  throw invalid(spec);
}

function has(r, k) {
  return Object.prototype.hasOwnProperty.call(r, k);
}

function numbers(records, field) {
  const out = [];
  for (const r of records) {
    if (!has(r, field)) continue;
    const v = r[field];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    else if (typeof v === 'string' && NUM_RE.test(v)) out.push(Number(v));
  }
  return out;
}

function buckets(records, field) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, field)) continue;
    const v = r[field];
    if (v === null || v === undefined) continue;
    const id = typeof v === 'object' ? 'o:' + JSON.stringify(v) : v;
    const b = map.get(id);
    if (b) b.count++;
    else map.set(id, { key: v, count: 1 });
  }
  const arr = [...map.values()];
  arr.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return arr;
}

function aggregate(records, spec) {
  const s = parseSpec(spec);
  const recs = Array.isArray(records) ? records : Array.from(records || []);
  switch (s.op) {
    case 'count':
      return { type: 'count', value: recs.length };
    case 'count_by':
      return { type: 'count_by', field: s.field, buckets: buckets(recs, s.field) };
    case 'top':
      return { type: 'top', field: s.field, buckets: buckets(recs, s.field).slice(0, s.n) };
    case 'sum':
    case 'avg':
    case 'min':
    case 'max': {
      const nums = numbers(recs, s.field);
      let value = null;
      if (nums.length) {
        if (s.op === 'sum') value = nums.reduce((a, b) => a + b, 0);
        else if (s.op === 'avg') value = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1e4) / 1e4;
        else if (s.op === 'min') value = nums.reduce((a, b) => (b < a ? b : a));
        else value = nums.reduce((a, b) => (b > a ? b : a));
      }
      return { type: s.op, field: s.field, value };
    }
    case 'histogram': {
      const step = s.k * UNITS[s.u];
      const counts = new Map();
      let lo = Infinity;
      let hi = -Infinity;
      for (const r of recs) {
        const t = r['@t'];
        if (typeof t !== 'number' || !Number.isFinite(t)) continue;
        const b = Math.floor(t / step) * step;
        counts.set(b, (counts.get(b) || 0) + 1);
        if (b < lo) lo = b;
        if (b > hi) hi = b;
      }
      const out = [];
      if (counts.size) {
        for (let b = lo; b <= hi; b += step) out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
      }
      return { type: 'histogram', interval: `${s.k}${s.u}`, buckets: out };
    }
    default: {
      const nums = numbers(recs, s.field).sort((a, b) => a - b);
      let value = null;
      if (nums.length) value = nums[Math.max(1, Math.ceil((s.p / 100) * nums.length)) - 1];
      return { type: s.op, field: s.field, value };
    }
  }
}

module.exports = { aggregate };
