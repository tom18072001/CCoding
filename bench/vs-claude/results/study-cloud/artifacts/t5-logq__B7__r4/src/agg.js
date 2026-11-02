'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const MAX_BUCKETS = 1000000;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec) {
  return new Error('invalid aggregation: ' + String(spec));
}

function numeric(records, f) {
  const out = [];
  for (const r of records) {
    if (!has(r, f)) continue;
    const v = r[f];
    if (typeof v === 'number') { if (!Number.isNaN(v)) out.push(v); }
    else if (typeof v === 'string' && NUM_RE.test(v)) out.push(Number(v));
  }
  return out;
}

function buckets(records, f) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, f)) continue;
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
  if (typeof spec !== 'string' || spec.trim() === '') throw invalid(spec);
  const parts = spec.trim().split(/\s+/);
  const kind = parts[0];
  const bad = () => invalid(spec);
  if (kind === 'count') {
    if (parts.length === 1) return { type: 'count', value: records.length };
    if (parts.length === 3 && parts[1] === 'by') {
      return { type: 'count_by', field: parts[2], buckets: buckets(records, parts[2]) };
    }
    throw bad();
  }
  if (kind === 'top') {
    if (parts.length !== 3 || !/^\d+$/.test(parts[1])) throw bad();
    const n = Number(parts[1]);
    if (!(n >= 1) || !Number.isSafeInteger(n)) throw bad();
    return { type: 'top', field: parts[2], buckets: buckets(records, parts[2]).slice(0, n) };
  }
  if (['sum', 'avg', 'min', 'max'].includes(kind)) {
    if (parts.length !== 2) throw bad();
    const f = parts[1];
    const vals = numeric(records, f);
    let value = null;
    if (vals.length) {
      if (kind === 'sum') value = vals.reduce((a, b) => a + b, 0);
      else if (kind === 'avg') value = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1e4) / 1e4;
      else if (kind === 'min') value = vals.reduce((a, b) => (b < a ? b : a));
      else value = vals.reduce((a, b) => (b > a ? b : a));
    }
    return { type: kind, field: f, value };
  }
  if (/^p(50|90|95|99)$/.test(kind)) {
    if (parts.length !== 2) throw bad();
    const f = parts[1];
    const p = Number(kind.slice(1));
    const vals = numeric(records, f).sort((a, b) => a - b);
    let value = null;
    if (vals.length) value = vals[Math.max(1, Math.ceil(p / 100 * vals.length)) - 1];
    return { type: kind, field: f, value };
  }
  if (kind === 'histogram') {
    const m = parts.length === 2 ? /^(\d+)([smhd])$/.exec(parts[1]) : null;
    if (!m || Number(m[1]) < 1) throw bad();
    const k = Number(m[1]);
    const ms = k * UNIT_MS[m[2]];
    const counts = new Map();
    let lo = Infinity, hi = -Infinity;
    for (const r of records) {
      if (!has(r, '@t') || typeof r['@t'] !== 'number' || Number.isNaN(r['@t'])) continue;
      const b = Math.floor(r['@t'] / ms) * ms;
      counts.set(b, (counts.get(b) || 0) + 1);
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    const out = [];
    if (counts.size) {
      if ((hi - lo) / ms + 1 > MAX_BUCKETS) {
        throw new Error('invalid aggregation: ' + String(spec) + ' (too many buckets, limit ' + MAX_BUCKETS + ')');
      }
      for (let b = lo; b <= hi; b += ms) {
        out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
      }
    }
    return { type: 'histogram', interval: k + m[2], buckets: out };
  }
  throw bad();
}

module.exports = { aggregate };
