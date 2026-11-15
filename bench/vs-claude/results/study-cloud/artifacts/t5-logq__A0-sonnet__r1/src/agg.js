'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec) {
  return new Error('invalid aggregation: ' + JSON.stringify(String(spec)));
}

function numeric(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function numbers(records, field) {
  const out = [];
  for (const r of records) {
    if (r && Object.prototype.hasOwnProperty.call(r, field)) {
      const n = numeric(r[field]);
      if (n !== null) out.push(n);
    }
  }
  return out;
}

function countBy(records, field) {
  const map = new Map();
  for (const r of records) {
    if (!r || !Object.prototype.hasOwnProperty.call(r, field)) continue;
    const v = r[field];
    if (v === null || v === undefined) continue;
    const id = typeof v + ':' + (typeof v === 'object' ? JSON.stringify(v) : String(v));
    const e = map.get(id);
    if (e) e.count++;
    else map.set(id, { key: v, count: 1 });
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw invalid(spec);
  const t = spec.trim().split(/\s+/);
  const kind = t[0];
  if (t.length === 1 && t[0] === '') throw invalid(spec);

  if (kind === 'count') {
    if (t.length === 1) return { type: 'count', value: records.length };
    if (t.length === 3 && t[1] === 'by') {
      return { type: 'count_by', field: t[2], buckets: countBy(records, t[2]) };
    }
    throw invalid(spec);
  }
  if (kind === 'top') {
    if (t.length !== 3 || !/^\d+$/.test(t[1]) || Number(t[1]) < 1) throw invalid(spec);
    return { type: 'top', field: t[2], buckets: countBy(records, t[2]).slice(0, Number(t[1])) };
  }
  if (['sum', 'avg', 'min', 'max'].includes(kind)) {
    if (t.length !== 2) throw invalid(spec);
    const f = t[1];
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
  if (['p50', 'p90', 'p95', 'p99'].includes(kind)) {
    if (t.length !== 2) throw invalid(spec);
    const nums = numbers(records, t[1]).sort((a, b) => a - b);
    let value = null;
    if (nums.length) value = nums[Math.max(1, Math.ceil((Number(kind.slice(1)) / 100) * nums.length)) - 1];
    return { type: kind, field: t[1], value };
  }
  if (kind === 'histogram') {
    const m = t.length === 2 && /^(\d+)([smhd])$/.exec(t[1]);
    if (!m || Number(m[1]) < 1) throw invalid(spec);
    const step = Number(m[1]) * UNIT_MS[m[2]];
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of records) {
      if (!r || typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
      const b = Math.floor(r['@t'] / step) * step;
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
    return { type: 'histogram', interval: t[1], buckets };
  }
  throw invalid(spec);
}

module.exports = { aggregate };
