'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec) {
  return new Error(`invalid aggregation: ${typeof spec === 'string' ? spec.trim() : String(spec)}`);
}

function parseSpec(spec) {
  if (typeof spec !== 'string') throw invalid(spec);
  const t = spec.trim().split(/\s+/);
  const [cmd] = t;
  if (cmd === 'count' && t.length === 1) return { kind: 'count' };
  if (cmd === 'count' && t.length === 3 && t[1] === 'by') return { kind: 'count_by', field: t[2] };
  if (cmd === 'top' && t.length === 3 && /^\d+$/.test(t[1]) && Number(t[1]) >= 1) {
    return { kind: 'top', n: Number(t[1]), field: t[2] };
  }
  if (['sum', 'avg', 'min', 'max'].includes(cmd) && t.length === 2) return { kind: cmd, field: t[1] };
  const pm = /^p(50|90|95|99)$/.exec(cmd || '');
  if (pm && t.length === 2) return { kind: 'pct', type: cmd, p: Number(pm[1]), field: t[1] };
  if (cmd === 'histogram' && t.length === 2) {
    const m = /^(\d+)([smhd])$/.exec(t[1]);
    if (m && Number(m[1]) >= 1) return { kind: 'histogram', interval: t[1], ms: Number(m[1]) * UNIT_MS[m[2]] };
  }
  throw invalid(spec);
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

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
    const mk = typeof v + ':' + (typeof v === 'object' ? JSON.stringify(v) : String(v));
    const b = map.get(mk);
    if (b) b.count++;
    else map.set(mk, { key: v, count: 1 });
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
  records = Array.from(records);
  switch (s.kind) {
    case 'count':
      return { type: 'count', value: records.length };
    case 'count_by':
      return { type: 'count_by', field: s.field, buckets: buckets(records, s.field) };
    case 'top':
      return { type: 'top', field: s.field, buckets: buckets(records, s.field).slice(0, s.n) };
    case 'sum':
    case 'avg':
    case 'min':
    case 'max': {
      const nums = numbers(records, s.field);
      let value = null;
      if (nums.length) {
        if (s.kind === 'sum') value = nums.reduce((a, b) => a + b, 0);
        else if (s.kind === 'avg') value = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1e4) / 1e4;
        else if (s.kind === 'min') value = nums.reduce((a, b) => (b < a ? b : a));
        else value = nums.reduce((a, b) => (b > a ? b : a));
      }
      return { type: s.kind, field: s.field, value };
    }
    case 'pct': {
      const nums = numbers(records, s.field).sort((a, b) => a - b);
      let value = null;
      if (nums.length) value = nums[Math.max(1, Math.ceil((s.p / 100) * nums.length)) - 1];
      return { type: s.type, field: s.field, value };
    }
    case 'histogram': {
      const counts = new Map();
      let lo = Infinity;
      let hi = -Infinity;
      for (const r of records) {
        if (typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
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
  throw invalid(spec);
}

module.exports = { aggregate };
