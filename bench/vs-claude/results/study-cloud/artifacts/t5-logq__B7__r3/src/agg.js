'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function bad(spec) {
  return new Error('invalid aggregation: ' + JSON.stringify(String(spec)));
}

function numOf(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function numbers(records, f) {
  const out = [];
  for (const r of records) {
    if (!has(r, f)) continue;
    const n = numOf(r[f]);
    if (n !== null) out.push(n);
  }
  return out;
}

function buckets(records, f) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, f) || r[f] == null) continue;
    const key = r[f];
    const id = typeof key === 'object' ? 'o:' + JSON.stringify(key) : typeof key + ':' + String(key);
    const b = map.get(id);
    if (b) b.count++;
    else map.set(id, { key, count: 1 });
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw bad(spec);
  const t = spec.trim().split(/\s+/);
  const head = t[0];
  if (!head) throw bad(spec);

  if (head === 'count') {
    if (t.length === 1) return { type: 'count', value: records.length };
    if (t.length === 3 && t[1] === 'by') {
      return { type: 'count_by', field: t[2], buckets: buckets(records, t[2]) };
    }
    throw bad(spec);
  }
  if (head === 'top') {
    if (t.length !== 3 || !/^\d+$/.test(t[1]) || Number(t[1]) < 1) throw bad(spec);
    return { type: 'top', field: t[2], buckets: buckets(records, t[2]).slice(0, Number(t[1])) };
  }
  if (['sum', 'avg', 'min', 'max'].includes(head)) {
    if (t.length !== 2) throw bad(spec);
    const xs = numbers(records, t[1]);
    let value = null;
    if (xs.length) {
      const sum = xs.reduce((a, b) => a + b, 0);
      if (head === 'sum') value = sum;
      else if (head === 'avg') value = Math.round((sum / xs.length) * 1e4) / 1e4;
      else if (head === 'min') value = xs.reduce((a, b) => (b < a ? b : a));
      else value = xs.reduce((a, b) => (b > a ? b : a));
    }
    return { type: head, field: t[1], value };
  }
  if (['p50', 'p90', 'p95', 'p99'].includes(head)) {
    if (t.length !== 2) throw bad(spec);
    const xs = numbers(records, t[1]).sort((a, b) => a - b);
    let value = null;
    if (xs.length) value = xs[Math.ceil((Number(head.slice(1)) / 100) * xs.length) - 1];
    return { type: head, field: t[1], value };
  }
  if (head === 'histogram') {
    const m = t.length === 2 ? /^(\d+)([smhd])$/.exec(t[1]) : null;
    if (!m || Number(m[1]) < 1) throw bad(spec);
    const k = Number(m[1]);
    const size = k * UNITS[m[2]];
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of records) {
      if (!has(r, '@t') || typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
      const b = Math.floor(r['@t'] / size) * size;
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
