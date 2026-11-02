'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function bad(spec) {
  return new Error('invalid aggregation: ' + String(spec));
}

function numVal(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function buckets(records, f) {
  const map = new Map();
  for (const r of records) {
    if (!Object.prototype.hasOwnProperty.call(r, f) || r[f] == null) continue;
    const k = typeof r[f] === 'object' ? 'o' + JSON.stringify(r[f]) : typeof r[f] + ':' + String(r[f]);
    const e = map.get(k);
    if (e) e.count++;
    else map.set(k, { key: r[f], count: 1 });
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key), y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function values(records, f) {
  const out = [];
  for (const r of records) {
    if (!Object.prototype.hasOwnProperty.call(r, f)) continue;
    const v = numVal(r[f]);
    if (v !== null) out.push(v);
  }
  return out;
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw bad(spec);
  const t = spec.trim().split(/\s+/);
  const cmd = t[0];
  if (cmd === 'count') {
    if (t.length === 1) return { type: 'count', value: records.length };
    if (t.length === 3 && t[1] === 'by') {
      return { type: 'count_by', field: t[2], buckets: buckets(records, t[2]) };
    }
    throw bad(spec);
  }
  if (cmd === 'top') {
    if (t.length !== 3 || !/^\d+$/.test(t[1])) throw bad(spec);
    const n = Number(t[1]);
    if (n < 1) throw bad(spec);
    return { type: 'top', field: t[2], buckets: buckets(records, t[2]).slice(0, n) };
  }
  if (['sum', 'avg', 'min', 'max'].includes(cmd)) {
    if (t.length !== 2) throw bad(spec);
    const vs = values(records, t[1]);
    let value = null;
    if (vs.length) {
      if (cmd === 'sum') value = vs.reduce((a, b) => a + b, 0);
      else if (cmd === 'avg') value = Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 1e4) / 1e4;
      else if (cmd === 'min') value = vs.reduce((a, b) => (b < a ? b : a));
      else value = vs.reduce((a, b) => (b > a ? b : a));
    }
    return { type: cmd, field: t[1], value };
  }
  if (['p50', 'p90', 'p95', 'p99'].includes(cmd)) {
    if (t.length !== 2) throw bad(spec);
    const vs = values(records, t[1]).sort((a, b) => a - b);
    let value = null;
    if (vs.length) {
      const rank = Math.ceil((Number(cmd.slice(1)) / 100) * vs.length);
      value = vs[Math.max(rank, 1) - 1];
    }
    return { type: cmd, field: t[1], value };
  }
  if (cmd === 'histogram') {
    const m = t.length === 2 ? /^(\d+)([smhd])$/.exec(t[1]) : null;
    if (!m || Number(m[1]) < 1) throw bad(spec);
    const k = Number(m[1]);
    const step = k * UNIT_MS[m[2]];
    const counts = new Map();
    let lo = Infinity, hi = -Infinity;
    for (const r of records) {
      if (typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
      const b = Math.floor(r['@t'] / step) * step;
      counts.set(b, (counts.get(b) || 0) + 1);
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    const out = [];
    if (counts.size) {
      for (let b = lo; b <= hi; b += step) {
        out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
      }
    }
    return { type: 'histogram', interval: t[1], buckets: out };
  }
  throw bad(spec);
}

module.exports = { aggregate };
