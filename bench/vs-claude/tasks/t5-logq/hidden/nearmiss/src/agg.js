'use strict';
const NUM = /^-?\d+(\.\d+)?$/;
const UNIT = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
const STATS = ['sum', 'avg', 'min', 'max', 'p50', 'p90', 'p95', 'p99'];

function bad(spec) {
  return new Error(`invalid aggregation: ${spec}`);
}

function parseSpec(spec) {
  const w = String(spec ?? '').trim().split(/\s+/).filter(Boolean);
  if (w.length === 1 && w[0] === 'count') return { type: 'count' };
  if (w.length === 3 && w[0] === 'count' && w[1] === 'by') return { type: 'count_by', field: w[2] };
  if (w.length === 3 && w[0] === 'top' && /^\d+$/.test(w[1]) && Number(w[1]) >= 1) return { type: 'top', n: Number(w[1]), field: w[2] };
  if (w.length === 2 && STATS.includes(w[0])) return { type: w[0], field: w[1] };
  if (w.length === 2 && w[0] === 'histogram') {
    const m = /^(\d+)([smhd])$/.exec(w[1]);
    if (m && Number(m[1]) >= 1) return { type: 'histogram', interval: w[1], ms: Number(m[1]) * UNIT[m[2]] };
  }
  throw bad(spec);
}

function numbers(records, field) {
  const out = [];
  for (const r of records) {
    const v = r[field];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    else if (typeof v === 'string' && NUM.test(v)) out.push(Number(v));
  }
  return out;
}

function buckets(records, field) {
  const m = new Map();
  for (const r of records) {
    const v = r[field];
    if (v === undefined && v === null) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || (String(a.key) < String(b.key) ? -1 : String(a.key) > String(b.key) ? 1 : 0));
}

function aggregate(records, spec) {
  const s = parseSpec(spec);
  if (s.type === 'count') return { type: 'count', value: records.length };
  if (s.type === 'count_by') return { type: 'count_by', field: s.field, buckets: buckets(records, s.field) };
  if (s.type === 'top') return { type: 'top', field: s.field, buckets: buckets(records, s.field).slice(0, s.n) };
  if (s.type === 'histogram') {
    const ts = records.map((r) => r['@t']).filter((t) => typeof t === 'number' && Number.isFinite(t));
    if (!ts.length) return { type: 'histogram', interval: s.interval, buckets: [] };
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of ts) {
      const b = Math.floor(t / s.ms) * s.ms;
      counts.set(b, (counts.get(b) ?? 0) + 1);
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    const out = [];
    for (let b = lo; b <= hi; b += s.ms) out.push({ key: new Date(b).toISOString(), count: counts.get(b) ?? 0 });
    return { type: 'histogram', interval: s.interval, buckets: out };
  }
  const xs = numbers(records, s.field);
  let value = null;
  if (xs.length) {
    if (s.type === 'sum') value = xs.reduce((a, b) => a + b, 0);
    else if (s.type === 'avg') value = Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1e4) / 1e4;
    else if (s.type === 'min') value = Math.min(...xs);
    else if (s.type === 'max') value = Math.max(...xs);
    else {
      const p = Number(s.type.slice(1));
      const sorted = [...xs].sort((a, b) => a - b);
      value = sorted[Math.ceil((p / 100) * sorted.length) - 1];
    }
  }
  return { type: s.type, field: s.field, value };
}

module.exports = { aggregate, parseSpec };
