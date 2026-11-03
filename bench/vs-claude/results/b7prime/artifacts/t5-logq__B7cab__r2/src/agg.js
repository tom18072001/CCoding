'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function bad(spec) {
  return new Error('invalid aggregation: ' + String(spec));
}

function has(rec, f) {
  return Object.prototype.hasOwnProperty.call(rec, f);
}

function numbers(records, f) {
  const out = [];
  for (const r of records) {
    if (!has(r, f)) continue;
    const v = r[f];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    else if (typeof v === 'string' && NUM_RE.test(v)) out.push(Number(v));
  }
  return out;
}

function buckets(records, f) {
  const m = new Map();
  for (const r of records) {
    if (!has(r, f) || r[f] == null) continue;
    m.set(r[f], (m.get(r[f]) || 0) + 1);
  }
  const arr = [...m].map(([key, count]) => ({ key, count }));
  arr.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return arr;
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw bad(spec);
  const t = spec.trim().split(/\s+/);
  const kind = t[0];
  if (kind === 'count' && t.length === 1) return { type: 'count', value: records.length };
  if (kind === 'count' && t.length === 3 && t[1] === 'by') {
    return { type: 'count_by', field: t[2], buckets: buckets(records, t[2]) };
  }
  if (kind === 'top' && t.length === 3 && /^\d+$/.test(t[1]) && Number(t[1]) >= 1) {
    return { type: 'top', field: t[2], buckets: buckets(records, t[2]).slice(0, Number(t[1])) };
  }
  if (['sum', 'avg', 'min', 'max'].includes(kind) && t.length === 2) {
    const v = numbers(records, t[1]);
    let value = null;
    if (v.length) {
      const sum = v.reduce((a, b) => a + b, 0);
      if (kind === 'sum') value = sum;
      else if (kind === 'avg') value = Math.round((sum / v.length) * 1e4) / 1e4;
      else if (kind === 'min') value = v.reduce((a, b) => (b < a ? b : a));
      else value = v.reduce((a, b) => (b > a ? b : a));
    }
    return { type: kind, field: t[1], value };
  }
  let m;
  if ((m = /^p(50|90|95|99)$/.exec(kind)) && t.length === 2) {
    const v = numbers(records, t[1]).sort((a, b) => a - b);
    let value = null;
    if (v.length) value = v[Math.ceil((Number(m[1]) / 100) * v.length) - 1];
    return { type: kind, field: t[1], value };
  }
  if (kind === 'histogram' && t.length === 2 && (m = /^(\d+)([smhd])$/.exec(t[1])) && Number(m[1]) >= 1) {
    const k = Number(m[1]);
    const size = k * UNITS[m[2]];
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of records) {
      const x = r['@t'];
      if (typeof x !== 'number' || !Number.isFinite(x)) continue;
      const b = Math.floor(x / size) * size;
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
