'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec, why) {
  return new Error('invalid aggregation: ' + (why || String(spec)));
}

function parseSpec(spec) {
  if (typeof spec !== 'string') throw invalid(spec, 'spec must be a string');
  const t = spec.trim().split(/\s+/).filter(Boolean);
  if (t.length === 0) throw invalid(spec, 'empty spec');
  const kw = t[0];
  const need = (n) => {
    if (t.length !== n) throw invalid(spec);
  };
  if (kw === 'count') {
    if (t.length === 1) return { kind: 'count' };
    if (t.length === 3 && t[1] === 'by') return { kind: 'count_by', field: t[2] };
    throw invalid(spec);
  }
  if (kw === 'top') {
    need(3);
    if (!/^\d+$/.test(t[1]) || Number(t[1]) < 1) throw invalid(spec, 'bad n');
    return { kind: 'top', n: Number(t[1]), field: t[2] };
  }
  if (['sum', 'avg', 'min', 'max'].includes(kw)) {
    need(2);
    return { kind: 'num', type: kw, field: t[1] };
  }
  if (/^p(50|90|95|99)$/.test(kw)) {
    need(2);
    return { kind: 'pct', type: kw, p: Number(kw.slice(1)), field: t[1] };
  }
  if (kw === 'histogram') {
    need(2);
    const m = /^(\d+)([smhd])$/.exec(t[1]);
    if (!m || Number(m[1]) < 1) throw invalid(spec, 'bad interval');
    return { kind: 'histogram', interval: t[1], ms: Number(m[1]) * UNIT_MS[m[2]] };
  }
  throw invalid(spec);
}

function has(r, f) {
  return r != null && Object.prototype.hasOwnProperty.call(r, f);
}

function buckets(records, field) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, field) || r[field] === null || r[field] === undefined) continue;
    const k = r[field];
    const e = map.get(k);
    if (e) e.count++;
    else map.set(k, { key: k, count: 1 });
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function numbers(records, field) {
  const out = [];
  for (const r of records) {
    if (!has(r, field)) continue;
    const v = r[field];
    if (typeof v === 'number') {
      if (Number.isFinite(v)) out.push(v);
    } else if (typeof v === 'string' && NUM_RE.test(v)) {
      out.push(Number(v));
    }
  }
  return out;
}

function aggregate(records, spec) {
  const s = parseSpec(spec);
  records = Array.isArray(records) ? records : Array.from(records || []);
  switch (s.kind) {
    case 'count':
      return { type: 'count', value: records.length };
    case 'count_by':
      return { type: 'count_by', field: s.field, buckets: buckets(records, s.field) };
    case 'top':
      return { type: 'top', field: s.field, buckets: buckets(records, s.field).slice(0, s.n) };
    case 'num': {
      const nums = numbers(records, s.field);
      let value = null;
      if (nums.length) {
        const sum = nums.reduce((a, b) => a + b, 0);
        if (s.type === 'sum') value = sum;
        else if (s.type === 'avg') value = Math.round((sum / nums.length) * 1e4) / 1e4;
        else if (s.type === 'min') value = nums.reduce((a, b) => (b < a ? b : a));
        else value = nums.reduce((a, b) => (b > a ? b : a));
      }
      return { type: s.type, field: s.field, value };
    }
    case 'pct': {
      const nums = numbers(records, s.field).sort((a, b) => a - b);
      let value = null;
      if (nums.length) {
        const rank = Math.max(1, Math.ceil((s.p / 100) * nums.length));
        value = nums[rank - 1];
      }
      return { type: s.type, field: s.field, value };
    }
    default: {
      const counts = new Map();
      let lo = Infinity;
      let hi = -Infinity;
      for (const r of records) {
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
  }
}

module.exports = { aggregate };
