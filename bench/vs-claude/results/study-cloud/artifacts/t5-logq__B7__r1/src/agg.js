'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function bad(spec) {
  return new Error('invalid aggregation: ' + String(spec));
}

function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function present(rec, f) {
  return Object.prototype.hasOwnProperty.call(rec, f) && rec[f] !== null && rec[f] !== undefined;
}

function parseSpec(spec) {
  if (typeof spec !== 'string') throw bad(spec);
  const parts = spec.trim().split(/\s+/);
  const cmd = parts[0];
  const k = parts.length;
  if (cmd === 'count' && k === 1) return { kind: 'count' };
  if (cmd === 'count' && k === 3 && parts[1] === 'by') return { kind: 'count_by', field: parts[2] };
  if (cmd === 'top' && k === 3 && /^\d+$/.test(parts[1]) && Number(parts[1]) >= 1) {
    return { kind: 'top', n: Number(parts[1]), field: parts[2] };
  }
  if (['sum', 'avg', 'min', 'max'].includes(cmd) && k === 2) return { kind: 'num', type: cmd, field: parts[1] };
  if (/^p(50|90|95|99)$/.test(cmd) && k === 2) {
    return { kind: 'pct', type: cmd, p: Number(cmd.slice(1)), field: parts[1] };
  }
  if (cmd === 'histogram' && k === 2) {
    const m = /^([1-9]\d*)([smhd])$/.exec(parts[1]);
    if (m) return { kind: 'hist', interval: m[1] + m[2], ms: Number(m[1]) * UNIT_MS[m[2]] };
  }
  throw bad(spec);
}

function buckets(records, field) {
  const map = new Map();
  for (const r of records) {
    if (!present(r, field)) continue;
    const v = r[field];
    map.set(v, (map.get(v) || 0) + 1);
  }
  const out = [];
  for (const [key, count] of map) out.push({ key, count });
  out.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return out;
}

function numbers(records, field) {
  const out = [];
  for (const r of records) {
    if (!Object.prototype.hasOwnProperty.call(r, field)) continue;
    const x = num(r[field]);
    if (x !== null) out.push(x);
  }
  return out;
}

function aggregate(records, spec) {
  const s = parseSpec(spec);
  switch (s.kind) {
    case 'count':
      return { type: 'count', value: records.length };
    case 'count_by':
      return { type: 'count_by', field: s.field, buckets: buckets(records, s.field) };
    case 'top':
      return { type: 'top', field: s.field, buckets: buckets(records, s.field).slice(0, s.n) };
    case 'num': {
      const xs = numbers(records, s.field);
      let value = null;
      if (xs.length) {
        const sum = xs.reduce((a, b) => a + b, 0);
        if (s.type === 'sum') value = sum;
        else if (s.type === 'avg') value = Math.round((sum / xs.length) * 1e4) / 1e4;
        else if (s.type === 'min') value = xs.reduce((a, b) => (b < a ? b : a));
        else value = xs.reduce((a, b) => (b > a ? b : a));
      }
      return { type: s.type, field: s.field, value };
    }
    case 'pct': {
      const xs = numbers(records, s.field).sort((a, b) => a - b);
      let value = null;
      if (xs.length) {
        const rank = Math.max(1, Math.ceil((s.p / 100) * xs.length));
        value = xs[rank - 1];
      }
      return { type: s.type, field: s.field, value };
    }
    default: {
      const counts = new Map();
      let lo = Infinity;
      let hi = -Infinity;
      for (const r of records) {
        const t = r['@t'];
        if (typeof t !== 'number' || !Number.isFinite(t)) continue;
        const b = Math.floor(t / s.ms) * s.ms;
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
