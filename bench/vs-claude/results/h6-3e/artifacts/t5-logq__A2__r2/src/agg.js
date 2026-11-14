'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec) {
  return new Error('invalid aggregation: ' + String(spec));
}

function numeric(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function has(r, f) {
  return Object.prototype.hasOwnProperty.call(r, f);
}

function buckets(records, field) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, field) || r[field] == null) continue;
    const k = r[field];
    map.set(k, (map.get(k) || 0) + 1);
  }
  const out = [];
  for (const [key, count] of map) out.push({ key, count });
  out.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key), y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return out;
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
  if (typeof spec !== 'string') throw invalid(spec);
  const parts = spec.trim().split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  let m;

  if (cmd === 'count' && args.length === 0) {
    return { type: 'count', value: records.length };
  }
  if (cmd === 'count' && args.length === 2 && args[0] === 'by') {
    return { type: 'count_by', field: args[1], buckets: buckets(records, args[1]) };
  }
  if (cmd === 'top' && args.length === 2 && /^\d+$/.test(args[0]) && Number(args[0]) >= 1) {
    return { type: 'top', field: args[1], buckets: buckets(records, args[1]).slice(0, Number(args[0])) };
  }
  if ((cmd === 'sum' || cmd === 'avg' || cmd === 'min' || cmd === 'max') && args.length === 1) {
    const field = args[0];
    const nums = numbers(records, field);
    let value = null;
    if (nums.length) {
      const sum = nums.reduce((a, b) => a + b, 0);
      if (cmd === 'sum') value = sum;
      else if (cmd === 'avg') value = Math.round((sum / nums.length) * 1e4) / 1e4;
      else if (cmd === 'min') value = nums.reduce((a, b) => (b < a ? b : a));
      else value = nums.reduce((a, b) => (b > a ? b : a));
    }
    return { type: cmd, field, value };
  }
  if ((m = /^p(50|90|95|99)$/.exec(cmd)) && args.length === 1) {
    const pct = Number(m[1]);
    const nums = numbers(records, args[0]).sort((a, b) => a - b);
    let value = null;
    if (nums.length) {
      const rank = Math.max(1, Math.ceil(pct / 100 * nums.length));
      value = nums[rank - 1];
    }
    return { type: cmd, field: args[0], value };
  }
  if (cmd === 'histogram' && args.length === 1 && (m = /^(\d+)([smhd])$/.exec(args[0])) && Number(m[1]) >= 1) {
    const k = Number(m[1]);
    const size = k * UNITS[m[2]];
    const counts = new Map();
    let lo = Infinity, hi = -Infinity;
    for (const r of records) {
      if (!has(r, '@t')) continue;
      const t = r['@t'];
      if (typeof t !== 'number' || !Number.isFinite(t)) continue;
      const b = Math.floor(t / size) * size;
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
  throw invalid(spec);
}

module.exports = { aggregate };
