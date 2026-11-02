'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(why) {
  return new Error('invalid aggregation: ' + why);
}

function numVal(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function nums(records, f) {
  const out = [];
  for (const r of records) {
    const n = numVal(r[f]);
    if (n !== null) out.push(n);
  }
  return out;
}

function countBy(records, f) {
  const map = new Map();
  for (const r of records) {
    const v = r[f];
    if (v === undefined || v === null) continue;
    const e = map.get(v);
    if (e) e.count++;
    else map.set(v, { key: v, count: 1 });
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key), y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw invalid('spec must be a string');
  const t = spec.trim().split(/\s+/);
  const kw = t[0];
  const args = t.slice(1);
  if (!kw) throw invalid('empty spec');
  const recs = Array.isArray(records) ? records : [];

  switch (kw) {
    case 'count':
      if (args.length === 0) return { type: 'count', value: recs.length };
      if (args.length === 2 && args[0] === 'by') {
        return { type: 'count_by', field: args[1], buckets: countBy(recs, args[1]) };
      }
      throw invalid('bad count spec: ' + spec.trim());
    case 'top': {
      if (args.length !== 2) throw invalid('top needs <n> <field>');
      if (!/^\d+$/.test(args[0]) || Number(args[0]) < 1) throw invalid('n must be integer >= 1');
      const n = Number(args[0]);
      return { type: 'top', field: args[1], buckets: countBy(recs, args[1]).slice(0, n) };
    }
    case 'sum': case 'avg': case 'min': case 'max': {
      if (args.length !== 1) throw invalid(kw + ' needs <field>');
      const f = args[0];
      const v = nums(recs, f);
      let value = null;
      if (v.length) {
        if (kw === 'sum') value = v.reduce((a, b) => a + b, 0);
        else if (kw === 'avg') value = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1e4) / 1e4;
        else if (kw === 'min') value = v.reduce((a, b) => (b < a ? b : a));
        else value = v.reduce((a, b) => (b > a ? b : a));
      }
      return { type: kw, field: f, value };
    }
    case 'p50': case 'p90': case 'p95': case 'p99': {
      if (args.length !== 1) throw invalid(kw + ' needs <field>');
      const p = Number(kw.slice(1));
      const v = nums(recs, args[0]).sort((a, b) => a - b);
      let value = null;
      if (v.length) value = v[Math.max(1, Math.ceil((p / 100) * v.length)) - 1];
      return { type: kw, field: args[0], value };
    }
    case 'histogram': {
      if (args.length !== 1) throw invalid('histogram needs <k><u>');
      const m = /^(\d+)([smhd])$/.exec(args[0]);
      if (!m || Number(m[1]) < 1) throw invalid('bad interval: ' + args[0]);
      const ms = Number(m[1]) * UNIT_MS[m[2]];
      const counts = new Map();
      let lo = Infinity, hi = -Infinity;
      for (const r of recs) {
        const at = r['@t'];
        if (typeof at !== 'number' || !Number.isFinite(at)) continue;
        const b = Math.floor(at / ms) * ms;
        counts.set(b, (counts.get(b) || 0) + 1);
        if (b < lo) lo = b;
        if (b > hi) hi = b;
      }
      const buckets = [];
      if (counts.size) {
        for (let b = lo; b <= hi; b += ms) {
          buckets.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
        }
      }
      return { type: 'histogram', interval: args[0], buckets };
    }
    default:
      throw invalid('unknown aggregation: ' + kw);
  }
}

module.exports = { aggregate };
