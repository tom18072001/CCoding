'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function bad(spec) {
  return new Error('invalid aggregation: ' + String(spec).trim());
}

function numOf(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function present(r, f) {
  return has(r, f) && r[f] !== null && r[f] !== undefined;
}

function buckets(records, f) {
  const m = new Map();
  for (const r of records) {
    if (!present(r, f)) continue;
    m.set(r[f], (m.get(r[f]) || 0) + 1);
  }
  const out = [];
  for (const [key, count] of m) out.push({ key, count });
  out.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key), y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return out;
}

function nums(records, f) {
  const out = [];
  for (const r of records) {
    if (!has(r, f)) continue;
    const v = numOf(r[f]);
    if (v !== null) out.push(v);
  }
  return out;
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw bad(spec);
  const w = spec.trim().split(/\s+/);
  const cmd = w[0];
  if (cmd === 'count' && w.length === 1) return { type: 'count', value: records.length };
  if (cmd === 'count' && w.length === 3 && w[1] === 'by') {
    return { type: 'count_by', field: w[2], buckets: buckets(records, w[2]) };
  }
  if (cmd === 'top' && w.length === 3 && /^\d+$/.test(w[1]) && Number(w[1]) >= 1) {
    return { type: 'top', field: w[2], buckets: buckets(records, w[2]).slice(0, Number(w[1])) };
  }
  if (['sum', 'avg', 'min', 'max'].includes(cmd) && w.length === 2) {
    const v = nums(records, w[1]);
    let value = null;
    if (v.length) {
      if (cmd === 'sum') value = v.reduce((a, b) => a + b, 0);
      else if (cmd === 'avg') value = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1e4) / 1e4;
      else if (cmd === 'min') value = v.reduce((a, b) => (b < a ? b : a));
      else value = v.reduce((a, b) => (b > a ? b : a));
    }
    return { type: cmd, field: w[1], value };
  }
  if (['p50', 'p90', 'p95', 'p99'].includes(cmd) && w.length === 2) {
    const v = nums(records, w[1]).sort((a, b) => a - b);
    let value = null;
    if (v.length) {
      const rank = Math.max(1, Math.ceil(Number(cmd.slice(1)) / 100 * v.length));
      value = v[rank - 1];
    }
    return { type: cmd, field: w[1], value };
  }
  if (cmd === 'histogram' && w.length === 2) {
    const m = /^(\d+)([smhd])$/.exec(w[1]);
    if (!m || Number(m[1]) < 1) throw bad(spec);
    const k = Number(m[1]);
    const size = k * UNITS[m[2]];
    const counts = new Map();
    let lo = Infinity, hi = -Infinity;
    for (const r of records) {
      if (typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
      const b = Math.floor(r['@t'] / size) * size;
      counts.set(b, (counts.get(b) || 0) + 1);
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    const out = [];
    if (counts.size) {
      for (let b = lo; b <= hi; b += size) {
        out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
      }
    }
    return { type: 'histogram', interval: k + m[2], buckets: out };
  }
  throw bad(spec);
}

module.exports = { aggregate };
