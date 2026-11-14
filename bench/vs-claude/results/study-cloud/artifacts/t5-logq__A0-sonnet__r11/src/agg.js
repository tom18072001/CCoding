'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function bad(spec) {
  return new Error('invalid aggregation: ' + String(spec));
}

function numbers(records, f) {
  const out = [];
  for (const r of records) {
    if (!has(r, f)) continue;
    const v = r[f];
    if (typeof v === 'number' && !Number.isNaN(v)) out.push(v);
    else if (typeof v === 'string' && NUM_RE.test(v)) out.push(Number(v));
  }
  return out;
}

function buckets(records, f) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, f) || r[f] === null || r[f] === undefined) continue;
    const v = r[f];
    const id = typeof v + ':' + String(v);
    const e = map.get(id);
    if (e) e.count++;
    else map.set(id, { key: v, count: 1 });
  }
  const arr = [...map.values()];
  arr.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key), y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return arr;
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw bad(spec);
  const parts = spec.trim().split(/\s+/);
  const kind = parts[0];
  const n = parts.length;
  if (kind === 'count' && n === 1) return { type: 'count', value: records.length };
  if (kind === 'count' && n === 3 && parts[1] === 'by') {
    return { type: 'count_by', field: parts[2], buckets: buckets(records, parts[2]) };
  }
  if (kind === 'top' && n === 3 && /^\d+$/.test(parts[1]) && Number(parts[1]) >= 1) {
    return { type: 'top', field: parts[2], buckets: buckets(records, parts[2]).slice(0, Number(parts[1])) };
  }
  if (['sum', 'avg', 'min', 'max'].includes(kind) && n === 2) {
    const f = parts[1];
    const vs = numbers(records, f);
    let value = null;
    if (vs.length) {
      if (kind === 'sum') value = vs.reduce((a, b) => a + b, 0);
      else if (kind === 'avg') value = Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 1e4) / 1e4;
      else if (kind === 'min') value = vs.reduce((a, b) => (b < a ? b : a));
      else value = vs.reduce((a, b) => (b > a ? b : a));
    }
    return { type: kind, field: f, value };
  }
  const pm = /^p(50|90|95|99)$/.exec(kind);
  if (pm && n === 2) {
    const f = parts[1];
    const vs = numbers(records, f).sort((a, b) => a - b);
    let value = null;
    if (vs.length) value = vs[Math.max(1, Math.ceil((Number(pm[1]) / 100) * vs.length)) - 1];
    return { type: kind, field: f, value };
  }
  if (kind === 'histogram' && n === 2) {
    const m = /^(\d+)([smhd])$/.exec(parts[1]);
    if (m && Number(m[1]) >= 1) {
      const step = Number(m[1]) * UNIT_MS[m[2]];
      const counts = new Map();
      let lo = Infinity, hi = -Infinity;
      for (const r of records) {
        const t = r['@t'];
        if (typeof t !== 'number' || !Number.isFinite(t)) continue;
        const b = Math.floor(t / step) * step;
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
      return { type: 'histogram', interval: parts[1], buckets: out };
    }
  }
  throw bad(spec);
}

module.exports = { aggregate };
