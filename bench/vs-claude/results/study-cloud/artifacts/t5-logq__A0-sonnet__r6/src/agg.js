'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function bad(spec) {
  return new Error('invalid aggregation: ' + String(spec));
}

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function present(r, f) {
  return r[f] !== undefined && r[f] !== null;
}

function buckets(records, f) {
  const prim = new Map();
  for (const r of records) {
    if (!present(r, f)) continue;
    let v = r[f];
    if (typeof v === 'object') {
      const s = JSON.stringify(v);
      v = prim.has('o:' + s) ? prim.get('o:' + s).key : v;
      const e = prim.get('o:' + s) || { key: v, count: 0 };
      e.count++;
      prim.set('o:' + s, e);
      continue;
    }
    const e = prim.get(v);
    if (e) e.count++;
    else prim.set(v, { key: v, count: 1 });
  }
  const arr = [...prim.values()];
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
  const parts = spec.trim().split(/\s+/);
  const cmd = parts[0];
  const argc = parts.length - 1;
  if (cmd === 'count') {
    if (argc === 0) return { type: 'count', value: records.length };
    if (argc === 2 && parts[1] === 'by') {
      return { type: 'count_by', field: parts[2], buckets: buckets(records, parts[2]) };
    }
    throw bad(spec);
  }
  if (cmd === 'top') {
    if (argc !== 2 || !/^\d+$/.test(parts[1]) || Number(parts[1]) < 1) throw bad(spec);
    const n = Number(parts[1]);
    return { type: 'top', field: parts[2], buckets: buckets(records, parts[2]).slice(0, n) };
  }
  if (['sum', 'avg', 'min', 'max'].includes(cmd)) {
    if (argc !== 1) throw bad(spec);
    const f = parts[1];
    const vals = [];
    for (const r of records) {
      const v = num(r[f]);
      if (v !== null) vals.push(v);
    }
    let value = null;
    if (vals.length) {
      if (cmd === 'sum') value = vals.reduce((a, b) => a + b, 0);
      else if (cmd === 'avg') value = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1e4) / 1e4;
      else if (cmd === 'min') value = vals.reduce((a, b) => (b < a ? b : a));
      else value = vals.reduce((a, b) => (b > a ? b : a));
    }
    return { type: cmd, field: f, value };
  }
  if (/^p(50|90|95|99)$/.test(cmd)) {
    if (argc !== 1) throw bad(spec);
    const f = parts[1];
    const p = Number(cmd.slice(1));
    const vals = [];
    for (const r of records) {
      const v = num(r[f]);
      if (v !== null) vals.push(v);
    }
    vals.sort((a, b) => a - b);
    let value = null;
    if (vals.length) value = vals[Math.max(1, Math.ceil((p / 100) * vals.length)) - 1];
    return { type: cmd, field: f, value };
  }
  if (cmd === 'histogram') {
    const m = argc === 1 ? /^(\d+)([smhd])$/.exec(parts[1]) : null;
    if (!m || Number(m[1]) < 1) throw bad(spec);
    const interval = Number(m[1]) * UNIT_MS[m[2]];
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of records) {
      const t = r['@t'];
      if (typeof t !== 'number' || !Number.isFinite(t)) continue;
      const b = Math.floor(t / interval) * interval;
      counts.set(b, (counts.get(b) || 0) + 1);
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    const out = [];
    if (counts.size) {
      for (let b = lo; b <= hi; b += interval) {
        out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
      }
    }
    return { type: 'histogram', interval: m[1] + m[2], buckets: out };
  }
  throw bad(spec);
}

module.exports = { aggregate };
