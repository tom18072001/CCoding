'use strict';

const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
const NUM_RE = /^-?\d+(\.\d+)?$/;

function invalid(spec, why) {
  return new Error('invalid aggregation' + (why ? ': ' + why : '') + ' (' + JSON.stringify(spec) + ')');
}

function numeric(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function numbers(records, field) {
  const out = [];
  for (const r of records) {
    const n = numeric(r[field]);
    if (n !== null) out.push(n);
  }
  return out;
}

function countBy(records, field) {
  const m = new Map();
  for (const r of records) {
    const v = r[field];
    if (v === undefined || v === null) continue;
    m.set(v, (m.get(v) || 0) + 1);
  }
  const buckets = [...m].map(([key, count]) => ({ key, count }));
  buckets.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    const x = String(a.key), y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return buckets;
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw invalid(spec, 'spec must be a string');
  const recs = Array.isArray(records) ? records : Array.from(records || []);
  const t = spec.trim();
  const parts = t === '' ? [] : t.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  if (cmd === 'count') {
    if (args.length === 0) return { type: 'count', value: recs.length };
    if (args.length === 2 && args[0] === 'by') {
      return { type: 'count_by', field: args[1], buckets: countBy(recs, args[1]) };
    }
    throw invalid(spec);
  }
  if (cmd === 'top') {
    if (args.length !== 2 || !/^\d+$/.test(args[0]) || Number(args[0]) < 1) throw invalid(spec);
    const n = Number(args[0]);
    return { type: 'top', field: args[1], buckets: countBy(recs, args[1]).slice(0, n) };
  }
  if (cmd === 'sum' || cmd === 'avg' || cmd === 'min' || cmd === 'max') {
    if (args.length !== 1) throw invalid(spec);
    const f = args[0];
    const xs = numbers(recs, f);
    let value = null;
    if (xs.length) {
      if (cmd === 'sum') value = xs.reduce((a, b) => a + b, 0);
      else if (cmd === 'avg') value = Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1e4) / 1e4;
      else if (cmd === 'min') value = xs.reduce((a, b) => (b < a ? b : a));
      else value = xs.reduce((a, b) => (b > a ? b : a));
    }
    return { type: cmd, field: f, value };
  }
  if (cmd === 'p50' || cmd === 'p90' || cmd === 'p95' || cmd === 'p99') {
    if (args.length !== 1) throw invalid(spec);
    const f = args[0];
    const xs = numbers(recs, f).sort((a, b) => a - b);
    let value = null;
    if (xs.length) {
      const rank = Math.ceil((Number(cmd.slice(1)) / 100) * xs.length);
      value = xs[Math.max(1, rank) - 1];
    }
    return { type: cmd, field: f, value };
  }
  if (cmd === 'histogram') {
    const m = args.length === 1 ? /^(\d+)([smhd])$/.exec(args[0]) : null;
    if (!m || Number(m[1]) < 1) throw invalid(spec);
    const size = Number(m[1]) * UNIT_MS[m[2]];
    const counts = new Map();
    let lo = Infinity, hi = -Infinity;
    for (const r of recs) {
      const at = r['@t'];
      if (typeof at !== 'number' || !Number.isFinite(at)) continue;
      const b = Math.floor(at / size) * size;
      counts.set(b, (counts.get(b) || 0) + 1);
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    const buckets = [];
    if (counts.size) {
      for (let b = lo; b <= hi; b += size) {
        buckets.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
      }
    }
    return { type: 'histogram', interval: args[0], buckets };
  }
  throw invalid(spec, 'unknown command');
}

module.exports = { aggregate };
