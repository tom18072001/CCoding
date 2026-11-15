'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function bad(spec, why) {
  return new Error('invalid aggregation: ' + (why || String(spec)));
}

function numVals(records, f) {
  const out = [];
  for (const r of records) {
    const v = r[f];
    if (typeof v === 'number') { if (Number.isFinite(v)) out.push(v); }
    else if (typeof v === 'string' && NUM_RE.test(v)) out.push(Number(v));
  }
  return out;
}

function countBy(records, f) {
  const m = new Map();
  for (const r of records) {
    const v = r[f];
    if (v === undefined || v === null) continue;
    const e = m.get(v);
    if (e) e.count++; else m.set(v, { key: v, count: 1 });
  }
  const b = [...m.values()];
  b.sort((x, y) => {
    if (y.count !== x.count) return y.count - x.count;
    const a = String(x.key), c = String(y.key);
    return a < c ? -1 : c < a ? 1 : 0;
  });
  return b;
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw bad(spec);
  const t = spec.trim().split(/\s+/).filter(Boolean);
  if (t.length === 0) throw bad(spec, 'empty spec');
  const cmd = t[0];
  const args = t.slice(1);
  const recs = Array.isArray(records) ? records : Array.from(records || []);

  if (cmd === 'count') {
    if (args.length === 0) return { type: 'count', value: recs.length };
    if (args.length === 2 && args[0] === 'by') {
      return { type: 'count_by', field: args[1], buckets: countBy(recs, args[1]) };
    }
    throw bad(spec);
  }
  if (cmd === 'top') {
    if (args.length !== 2 || !/^\d+$/.test(args[0])) throw bad(spec);
    const n = Number(args[0]);
    if (!Number.isSafeInteger(n) || n < 1) throw bad(spec);
    return { type: 'top', field: args[1], buckets: countBy(recs, args[1]).slice(0, n) };
  }
  if (cmd === 'sum' || cmd === 'avg' || cmd === 'min' || cmd === 'max') {
    if (args.length !== 1) throw bad(spec);
    const f = args[0];
    const v = numVals(recs, f);
    let value = null;
    if (v.length) {
      if (cmd === 'sum') value = v.reduce((a, b) => a + b, 0);
      else if (cmd === 'avg') value = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1e4) / 1e4;
      else if (cmd === 'min') value = v.reduce((a, b) => (b < a ? b : a));
      else value = v.reduce((a, b) => (b > a ? b : a));
    }
    return { type: cmd, field: f, value };
  }
  if (cmd === 'p50' || cmd === 'p90' || cmd === 'p95' || cmd === 'p99') {
    if (args.length !== 1) throw bad(spec);
    const p = Number(cmd.slice(1));
    const v = numVals(recs, args[0]).sort((a, b) => a - b);
    let value = null;
    if (v.length) value = v[Math.max(1, Math.ceil((p / 100) * v.length)) - 1];
    return { type: cmd, field: args[0], value };
  }
  if (cmd === 'histogram') {
    if (args.length !== 1) throw bad(spec);
    const mm = /^(\d+)([smhd])$/.exec(args[0]);
    if (!mm) throw bad(spec);
    const k = Number(mm[1]);
    if (!Number.isSafeInteger(k) || k < 1) throw bad(spec);
    const step = k * UNIT_MS[mm[2]];
    const counts = new Map();
    let lo = Infinity, hi = -Infinity;
    for (const r of recs) {
      const x = r['@t'];
      if (typeof x !== 'number' || !Number.isFinite(x)) continue;
      const b = Math.floor(x / step) * step;
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
