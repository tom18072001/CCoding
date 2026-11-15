'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const UNIT = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function bad(spec) {
  return new Error(`invalid aggregation: ${String(spec)}`);
}

function parseSpec(spec) {
  if (typeof spec !== 'string') throw bad(spec);
  const t = spec.trim().split(/\s+/);
  const k = t[0];
  if (k === 'count' && t.length === 1) return { k: 'count' };
  if (k === 'count' && t.length === 3 && t[1] === 'by') return { k: 'count_by', f: t[2] };
  if (k === 'top' && t.length === 3 && /^\d+$/.test(t[1]) && Number(t[1]) >= 1) {
    return { k: 'top', n: Number(t[1]), f: t[2] };
  }
  if (['sum', 'avg', 'min', 'max'].includes(k) && t.length === 2) return { k, f: t[1] };
  if (/^p(50|90|95|99)$/.test(k) && t.length === 2) return { k, f: t[1], p: Number(k.slice(1)) };
  if (k === 'histogram' && t.length === 2) {
    const m = /^(\d+)([smhd])$/.exec(t[1]);
    if (m && Number(m[1]) >= 1) return { k, ms: Number(m[1]) * UNIT[m[2]], interval: `${Number(m[1])}${m[2]}` };
  }
  throw bad(spec);
}

function numbers(records, f) {
  const out = [];
  for (const r of records) {
    if (!has(r, f)) continue;
    const v = r[f];
    if (typeof v === 'number') { if (!Number.isNaN(v)) out.push(v); }
    else if (typeof v === 'string' && NUM_RE.test(v)) out.push(Number(v));
  }
  return out;
}

function buckets(records, f) {
  const m = new Map();
  for (const r of records) {
    if (!has(r, f) || r[f] == null) continue;
    const v = r[f];
    const id = typeof v + ':' + (typeof v === 'object' ? JSON.stringify(v) : String(v));
    const b = m.get(id);
    if (b) b.count++;
    else m.set(id, { key: v, count: 1 });
  }
  return [...m.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function aggregate(records, spec) {
  const s = parseSpec(spec);
  const recs = Array.from(records);
  switch (s.k) {
    case 'count': return { type: 'count', value: recs.length };
    case 'count_by': return { type: 'count_by', field: s.f, buckets: buckets(recs, s.f) };
    case 'top': return { type: 'top', field: s.f, buckets: buckets(recs, s.f).slice(0, s.n) };
    case 'histogram': {
      const counts = new Map();
      let lo = Infinity;
      let hi = -Infinity;
      for (const r of recs) {
        if (!has(r, '@t') || typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
        const b = Math.floor(r['@t'] / s.ms) * s.ms;
        counts.set(b, (counts.get(b) || 0) + 1);
        if (b < lo) lo = b;
        if (b > hi) hi = b;
      }
      const out = [];
      if (counts.size) {
        for (let b = lo; b <= hi; b += s.ms) {
          out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
        }
      }
      return { type: 'histogram', interval: s.interval, buckets: out };
    }
    default: {
      const nums = numbers(recs, s.f);
      let value = null;
      if (nums.length) {
        if (s.k === 'sum') value = nums.reduce((a, b) => a + b, 0);
        else if (s.k === 'avg') value = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1e4) / 1e4;
        else if (s.k === 'min') value = nums.reduce((a, b) => (b < a ? b : a));
        else if (s.k === 'max') value = nums.reduce((a, b) => (b > a ? b : a));
        else {
          nums.sort((a, b) => a - b);
          value = nums[Math.max(1, Math.ceil((s.p / 100) * nums.length)) - 1];
        }
      }
      return { type: s.k, field: s.f, value };
    }
  }
}

module.exports = { aggregate };
