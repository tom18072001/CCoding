'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function bad(spec) {
  return new Error('invalid aggregation: ' + String(spec).trim());
}

function numeric(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function parseSpec(spec) {
  if (typeof spec !== 'string') throw bad(spec);
  const parts = spec.trim().split(/\s+/);
  const cmd = parts[0];
  const len = parts.length;
  if (cmd === 'count') {
    if (len === 1) return { cmd: 'count' };
    if (len === 3 && parts[1] === 'by') return { cmd: 'count_by', field: parts[2] };
  } else if (cmd === 'top') {
    if (len === 3 && /^\d+$/.test(parts[1]) && Number(parts[1]) >= 1) {
      return { cmd: 'top', n: Number(parts[1]), field: parts[2] };
    }
  } else if (['sum', 'avg', 'min', 'max', 'p50', 'p90', 'p95', 'p99'].includes(cmd)) {
    if (len === 2) return { cmd, field: parts[1] };
  } else if (cmd === 'histogram') {
    const m = len === 2 && /^(\d+)([smhd])$/.exec(parts[1]);
    if (m && Number(m[1]) >= 1) return { cmd, k: Number(m[1]), u: m[2] };
  }
  throw bad(spec);
}

function groupCounts(records, field) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, field)) continue;
    const v = r[field];
    if (v === null || v === undefined) continue;
    const mk = typeof v + ':' + (typeof v === 'object' ? JSON.stringify(v) : String(v));
    const e = map.get(mk);
    if (e) e.count++;
    else map.set(mk, { key: v, count: 1 });
  }
  const buckets = [...map.values()];
  buckets.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key), y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return buckets;
}

function numbers(records, field) {
  const out = [];
  for (const r of records) {
    if (!has(r, field)) continue;
    const v = numeric(r[field]);
    if (v !== null) out.push(v);
  }
  return out;
}

function aggregate(records, spec) {
  const s = parseSpec(spec);
  records = Array.from(records);
  switch (s.cmd) {
    case 'count':
      return { type: 'count', value: records.length };
    case 'count_by':
      return { type: 'count_by', field: s.field, buckets: groupCounts(records, s.field) };
    case 'top':
      return { type: 'top', field: s.field, buckets: groupCounts(records, s.field).slice(0, s.n) };
    case 'histogram': {
      const step = s.k * UNIT_MS[s.u];
      const counts = new Map();
      let lo = Infinity, hi = -Infinity;
      for (const r of records) {
        if (!has(r, '@t') || typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
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
      return { type: 'histogram', interval: s.k + s.u, buckets };
    }
    default: {
      const vals = numbers(records, s.field);
      let value = null;
      if (vals.length) {
        if (s.cmd === 'sum') value = vals.reduce((a, b) => a + b, 0);
        else if (s.cmd === 'avg') value = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1e4) / 1e4;
        else if (s.cmd === 'min') value = vals.reduce((a, b) => (b < a ? b : a));
        else if (s.cmd === 'max') value = vals.reduce((a, b) => (b > a ? b : a));
        else {
          const pct = Number(s.cmd.slice(1));
          vals.sort((a, b) => a - b);
          const rank = Math.max(1, Math.ceil(pct / 100 * vals.length));
          value = vals[rank - 1];
        }
      }
      return { type: s.cmd, field: s.field, value };
    }
  }
}

module.exports = { aggregate };
