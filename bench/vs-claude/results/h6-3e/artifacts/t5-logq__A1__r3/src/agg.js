'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec) {
  return new Error('invalid aggregation: ' + String(spec));
}

function num(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function numbers(records, field) {
  const out = [];
  for (const r of records) {
    if (!has(r, field)) continue;
    const v = num(r[field]);
    if (v !== null) out.push(v);
  }
  return out;
}

function buckets(records, field) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, field)) continue;
    const v = r[field];
    if (v === null || v === undefined) continue;
    const mk = typeof v === 'object' ? 'obj:' + JSON.stringify(v) : v;
    const b = map.get(mk);
    if (b) b.count++;
    else map.set(mk, { key: v, count: 1 });
  }
  const list = [...map.values()];
  list.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const ka = String(a.key);
    const kb = String(b.key);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return list;
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw invalid(spec);
  const parts = spec.trim().split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  if (spec.trim() === '') throw invalid(spec);

  if (cmd === 'count') {
    if (args.length === 0) return { type: 'count', value: records.length };
    if (args.length === 2 && args[0] === 'by') {
      return { type: 'count_by', field: args[1], buckets: buckets(records, args[1]) };
    }
    throw invalid(spec);
  }

  if (cmd === 'top') {
    if (args.length !== 2 || !/^\d+$/.test(args[0])) throw invalid(spec);
    const n = Number(args[0]);
    if (n < 1) throw invalid(spec);
    return { type: 'top', field: args[1], buckets: buckets(records, args[1]).slice(0, n) };
  }

  if (cmd === 'sum' || cmd === 'avg' || cmd === 'min' || cmd === 'max') {
    if (args.length !== 1) throw invalid(spec);
    const f = args[0];
    const vals = numbers(records, f);
    let value = null;
    if (vals.length > 0) {
      if (cmd === 'sum' || cmd === 'avg') {
        let s = 0;
        for (const v of vals) s += v;
        value = cmd === 'sum' ? s : Math.round((s / vals.length) * 1e4) / 1e4;
      } else if (cmd === 'min') {
        value = vals.reduce((a, b) => (b < a ? b : a));
      } else {
        value = vals.reduce((a, b) => (b > a ? b : a));
      }
    }
    return { type: cmd, field: f, value };
  }

  if (cmd === 'p50' || cmd === 'p90' || cmd === 'p95' || cmd === 'p99') {
    if (args.length !== 1) throw invalid(spec);
    const f = args[0];
    const pc = Number(cmd.slice(1));
    const vals = numbers(records, f).sort((a, b) => a - b);
    let value = null;
    if (vals.length > 0) {
      const rank = Math.max(1, Math.ceil((pc / 100) * vals.length));
      value = vals[rank - 1];
    }
    return { type: cmd, field: f, value };
  }

  if (cmd === 'histogram') {
    if (args.length !== 1) throw invalid(spec);
    const m = /^(\d+)([smhd])$/.exec(args[0]);
    if (!m || Number(m[1]) < 1) throw invalid(spec);
    const k = Number(m[1]);
    const size = k * UNIT_MS[m[2]];
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of records) {
      const t = has(r, '@t') ? r['@t'] : undefined;
      if (typeof t !== 'number' || !Number.isFinite(t)) continue;
      const idx = Math.floor(t / size);
      counts.set(idx, (counts.get(idx) || 0) + 1);
      if (idx < lo) lo = idx;
      if (idx > hi) hi = idx;
    }
    const out = [];
    for (let idx = lo; idx <= hi; idx++) {
      out.push({ key: new Date(idx * size).toISOString(), count: counts.get(idx) || 0 });
    }
    return { type: 'histogram', interval: k + m[2], buckets: out };
  }

  throw invalid(spec);
}

module.exports = { aggregate };
