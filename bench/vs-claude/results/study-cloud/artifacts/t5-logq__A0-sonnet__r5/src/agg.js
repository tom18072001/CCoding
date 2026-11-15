'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const FIELD_RE = /^[A-Za-z_@][A-Za-z0-9_.@-]*$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function invalid(spec) {
  return new Error(`invalid aggregation: ${JSON.stringify(spec)}`);
}

function numOf(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function nums(records, f) {
  const out = [];
  for (const r of records) {
    if (!has(r, f)) continue;
    const n = numOf(r[f]);
    if (n !== null && !Number.isNaN(n)) out.push(n);
  }
  return out;
}

function buckets(records, f) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, f)) continue;
    const v = r[f];
    if (v === null || v === undefined) continue;
    const id = typeof v === 'object' ? 'o:' + JSON.stringify(v) : typeof v + ':' + String(v);
    const b = map.get(id);
    if (b) b.count++;
    else map.set(id, { key: v, count: 1 });
  }
  const list = [...map.values()];
  list.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return list;
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw invalid(spec);
  const w = spec.trim().split(/\s+/);
  const kind = w[0];
  const fieldOk = (f) => f !== undefined && FIELD_RE.test(f);

  if (kind === 'count') {
    if (w.length === 1) return { type: 'count', value: records.length };
    if (w.length === 3 && w[1] === 'by' && fieldOk(w[2])) {
      return { type: 'count_by', field: w[2], buckets: buckets(records, w[2]) };
    }
    throw invalid(spec);
  }
  if (kind === 'top') {
    if (w.length === 3 && /^\d+$/.test(w[1]) && Number(w[1]) >= 1 && fieldOk(w[2])) {
      return { type: 'top', field: w[2], buckets: buckets(records, w[2]).slice(0, Number(w[1])) };
    }
    throw invalid(spec);
  }
  if (['sum', 'avg', 'min', 'max'].includes(kind)) {
    if (w.length !== 2 || !fieldOk(w[1])) throw invalid(spec);
    const f = w[1];
    const a = nums(records, f);
    let value = null;
    if (a.length) {
      if (kind === 'sum') value = a.reduce((x, y) => x + y, 0);
      else if (kind === 'avg') value = Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 1e4) / 1e4;
      else if (kind === 'min') value = a.reduce((x, y) => (y < x ? y : x));
      else value = a.reduce((x, y) => (y > x ? y : x));
    }
    return { type: kind, field: f, value };
  }
  if (/^p(50|90|95|99)$/.test(kind)) {
    if (w.length !== 2 || !fieldOk(w[1])) throw invalid(spec);
    const a = nums(records, w[1]).sort((x, y) => x - y);
    let value = null;
    if (a.length) {
      const rank = Math.max(1, Math.ceil((Number(kind.slice(1)) / 100) * a.length));
      value = a[rank - 1];
    }
    return { type: kind, field: w[1], value };
  }
  if (kind === 'histogram') {
    const m = w.length === 2 && /^(\d+)([smhd])$/.exec(w[1]);
    if (!m || Number(m[1]) < 1) throw invalid(spec);
    const k = Number(m[1]);
    const step = k * UNIT_MS[m[2]];
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of records) {
      if (!has(r, '@t') || typeof r['@t'] !== 'number' || Number.isNaN(r['@t'])) continue;
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
    return { type: 'histogram', interval: `${k}${m[2]}`, buckets: out };
  }
  throw invalid(spec);
}

module.exports = { aggregate };
