'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function bad(spec) {
  return new Error('invalid aggregation: ' + JSON.stringify(String(spec)));
}

function numeric(records, f) {
  const out = [];
  for (const r of records) {
    if (!hasOwn(r, f)) continue;
    const v = r[f];
    if (typeof v === 'number') { if (Number.isFinite(v)) out.push(v); }
    else if (typeof v === 'string' && NUM_RE.test(v)) out.push(Number(v));
  }
  return out;
}

function buckets(records, f) {
  const map = new Map();
  for (const r of records) {
    if (!hasOwn(r, f)) continue;
    const v = r[f];
    if (v === null || v === undefined) continue;
    const id = typeof v + ':' + (typeof v === 'object' ? JSON.stringify(v) : String(v));
    const b = map.get(id);
    if (b) b.count++;
    else map.set(id, { key: v, count: 1 });
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key), y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw bad(spec);
  const parts = spec.trim().split(/\s+/);
  const kw = parts[0];
  const n = parts.length;
  if (kw === 'count' && n === 1) return { type: 'count', value: records.length };
  if (kw === 'count' && n === 3 && parts[1] === 'by') {
    return { type: 'count_by', field: parts[2], buckets: buckets(records, parts[2]) };
  }
  if (kw === 'top' && n === 3 && /^\d+$/.test(parts[1]) && Number(parts[1]) >= 1) {
    return { type: 'top', field: parts[2], buckets: buckets(records, parts[2]).slice(0, Number(parts[1])) };
  }
  if ((kw === 'sum' || kw === 'avg' || kw === 'min' || kw === 'max') && n === 2) {
    const f = parts[1];
    const vals = numeric(records, f);
    let value = null;
    if (vals.length) {
      if (kw === 'sum') value = vals.reduce((a, b) => a + b, 0);
      else if (kw === 'avg') value = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1e4) / 1e4;
      else if (kw === 'min') value = vals.reduce((a, b) => (b < a ? b : a));
      else value = vals.reduce((a, b) => (b > a ? b : a));
    }
    return { type: kw, field: f, value };
  }
  if (/^p(50|90|95|99)$/.test(kw) && n === 2) {
    const vals = numeric(records, parts[1]).sort((a, b) => a - b);
    let value = null;
    if (vals.length) value = vals[Math.max(1, Math.ceil((Number(kw.slice(1)) / 100) * vals.length)) - 1];
    return { type: kw, field: parts[1], value };
  }
  if (kw === 'histogram' && n === 2) {
    const m = /^(\d+)([smhd])$/.exec(parts[1]);
    if (m && Number(m[1]) >= 1) {
      const step = Number(m[1]) * UNITS[m[2]];
      const counts = new Map();
      let lo = Infinity, hi = -Infinity;
      for (const r of records) {
        if (!hasOwn(r, '@t') || typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
        const b = Math.floor(r['@t'] / step) * step;
        counts.set(b, (counts.get(b) || 0) + 1);
        if (b < lo) lo = b;
        if (b > hi) hi = b;
      }
      const out = [];
      if (counts.size) {
        for (let b = lo; b <= hi; b += step) out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
      }
      return { type: 'histogram', interval: parts[1], buckets: out };
    }
  }
  throw bad(spec);
}

module.exports = { aggregate };
