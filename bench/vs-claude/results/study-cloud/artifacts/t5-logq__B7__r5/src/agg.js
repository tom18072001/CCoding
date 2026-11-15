'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function bad(spec) {
  return new Error('invalid aggregation: ' + String(spec));
}

function num(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function numbers(records, f) {
  const out = [];
  for (const r of records) {
    if (!has(r, f)) continue;
    const n = num(r[f]);
    if (n !== null) out.push(n);
  }
  return out;
}

function countBy(records, f) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, f)) continue;
    const v = r[f];
    if (v === null || v === undefined) continue;
    const k = typeof v === 'object' ? 'o:' + JSON.stringify(v) : v;
    const e = map.get(k);
    if (e) e.count++;
    else map.set(k, { key: v, count: 1 });
  }
  const buckets = [...map.values()];
  buckets.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const sa = String(a.key);
    const sb = String(b.key);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  return buckets;
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw bad(spec);
  const parts = spec.trim().split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  if (cmd === 'count') {
    if (args.length === 0) return { type: 'count', value: records.length };
    if (args.length === 2 && args[0] === 'by') {
      return { type: 'count_by', field: args[1], buckets: countBy(records, args[1]) };
    }
    throw bad(spec);
  }
  if (cmd === 'top') {
    if (args.length !== 2 || !/^\d+$/.test(args[0]) || Number(args[0]) < 1) throw bad(spec);
    return { type: 'top', field: args[1], buckets: countBy(records, args[1]).slice(0, Number(args[0])) };
  }
  if (cmd === 'sum' || cmd === 'avg' || cmd === 'min' || cmd === 'max') {
    if (args.length !== 1) throw bad(spec);
    const f = args[0];
    const xs = numbers(records, f);
    let value = null;
    if (xs.length) {
      if (cmd === 'sum') value = xs.reduce((a, b) => a + b, 0);
      else if (cmd === 'avg') value = Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1e4) / 1e4;
      else if (cmd === 'min') value = xs.reduce((a, b) => (b < a ? b : a));
      else value = xs.reduce((a, b) => (b > a ? b : a));
    }
    return { type: cmd, field: f, value };
  }
  const pm = /^p(50|90|95|99)$/.exec(cmd);
  if (pm) {
    if (args.length !== 1) throw bad(spec);
    const xs = numbers(records, args[0]).sort((a, b) => a - b);
    let value = null;
    if (xs.length) value = xs[Math.max(1, Math.ceil((Number(pm[1]) / 100) * xs.length)) - 1];
    return { type: cmd, field: args[0], value };
  }
  if (cmd === 'histogram') {
    const m = args.length === 1 ? /^(\d+)([smhd])$/.exec(args[0]) : null;
    if (!m || Number(m[1]) < 1) throw bad(spec);
    const k = Number(m[1]);
    const step = k * UNIT_MS[m[2]];
    if (!m || !step) throw bad(spec);
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of records) {
      const t = r['@t'];
      if (typeof t !== 'number' || !Number.isFinite(t)) continue;
      const b = Math.floor(t / step) * step;
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
    return { type: 'histogram', interval: args[0], buckets };
  }
  throw bad(spec);
}

module.exports = { aggregate };
