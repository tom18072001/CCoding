'use strict';

const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
const NUM_RE = /^-?\d+(\.\d+)?$/;
const INT_RE = /^[0-9]+$/;

function bad(detail) {
  return new Error('invalid aggregation' + (detail ? ': ' + detail : ''));
}

function has(r, f) {
  return r !== null && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, f);
}

function buckets(records, f) {
  const m = new Map();
  for (const r of records) {
    if (!has(r, f) || r[f] === null || r[f] === undefined) continue;
    m.set(r[f], (m.get(r[f]) || 0) + 1);
  }
  return [...m].map(([key, count]) => ({ key, count })).sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    const x = String(a.key), y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function nums(records, f) {
  const out = [];
  for (const r of records) {
    if (!has(r, f)) continue;
    const v = r[f];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    else if (typeof v === 'string' && NUM_RE.test(v)) out.push(Number(v));
  }
  return out;
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw bad('spec must be a string');
  const parts = spec.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) throw bad('empty spec');
  const kw = parts[0];
  const recs = Array.isArray(records) ? records : [];

  if (kw === 'count') {
    if (parts.length === 1) return { type: 'count', value: recs.length };
    if (parts.length === 3 && parts[1] === 'by') {
      return { type: 'count_by', field: parts[2], buckets: buckets(recs, parts[2]) };
    }
    throw bad(spec.trim());
  }
  if (kw === 'top') {
    if (parts.length !== 3 || !INT_RE.test(parts[1]) || Number(parts[1]) < 1) throw bad(spec.trim());
    return { type: 'top', field: parts[2], buckets: buckets(recs, parts[2]).slice(0, Number(parts[1])) };
  }
  if (['sum', 'avg', 'min', 'max'].includes(kw)) {
    if (parts.length !== 2) throw bad(spec.trim());
    const f = parts[1];
    const v = nums(recs, f);
    let value = null;
    if (v.length) {
      if (kw === 'sum') value = v.reduce((a, b) => a + b, 0);
      else if (kw === 'avg') value = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1e4) / 1e4;
      else if (kw === 'min') value = v.reduce((a, b) => (b < a ? b : a));
      else value = v.reduce((a, b) => (b > a ? b : a));
    }
    return { type: kw, field: f, value };
  }
  if (['p50', 'p90', 'p95', 'p99'].includes(kw)) {
    if (parts.length !== 2) throw bad(spec.trim());
    const v = nums(recs, parts[1]).sort((a, b) => a - b);
    let value = null;
    if (v.length) value = v[Math.max(1, Math.ceil((Number(kw.slice(1)) / 100) * v.length)) - 1];
    return { type: kw, field: parts[1], value };
  }
  if (kw === 'histogram') {
    const m = parts.length === 2 && /^([0-9]+)([smhd])$/.exec(parts[1]);
    if (!m || Number(m[1]) < 1) throw bad(spec.trim());
    const size = Number(m[1]) * UNITS[m[2]];
    const counts = new Map();
    let lo = Infinity, hi = -Infinity;
    for (const r of recs) {
      if (!has(r, '@t') || typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
      const b = Math.floor(r['@t'] / size) * size;
      counts.set(b, (counts.get(b) || 0) + 1);
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    const out = [];
    if (counts.size) {
      for (let b = lo; b <= hi; b += size) out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
    }
    return { type: 'histogram', interval: parts[1], buckets: out };
  }
  throw bad('unknown spec ' + spec.trim());
}

module.exports = { aggregate };
