'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec, why) {
  return new Error('invalid aggregation: ' + JSON.stringify(spec) + (why ? ' (' + why + ')' : ''));
}

function parseSpec(spec) {
  if (typeof spec !== 'string') throw invalid(spec, 'spec must be a string');
  const w = spec.trim().split(/\s+/);
  const cmd = w[0];
  if (cmd === 'count') {
    if (w.length === 1) return { kind: 'count' };
    if (w.length === 3 && w[1] === 'by') return { kind: 'count_by', field: w[2] };
  } else if (cmd === 'top') {
    if (w.length === 3 && /^\d+$/.test(w[1]) && Number(w[1]) >= 1) {
      return { kind: 'top', n: Number(w[1]), field: w[2] };
    }
  } else if (['sum', 'avg', 'min', 'max'].includes(cmd)) {
    if (w.length === 2) return { kind: 'num', type: cmd, field: w[1] };
  } else if (/^p(50|90|95|99)$/.test(cmd)) {
    if (w.length === 2) return { kind: 'pct', type: cmd, p: Number(cmd.slice(1)), field: w[1] };
  } else if (cmd === 'histogram') {
    const m = w.length === 2 && /^(\d+)([smhd])$/.exec(w[1]);
    if (m && Number(m[1]) >= 1) {
      return { kind: 'hist', interval: w[1], ms: Number(m[1]) * UNIT_MS[m[2]] };
    }
  }
  throw invalid(spec);
}

function numeric(records, field) {
  const out = [];
  for (const r of records) {
    if (!r || !has(r, field)) continue;
    const v = r[field];
    if (typeof v === 'number') { if (!Number.isNaN(v)) out.push(v); }
    else if (typeof v === 'string' && NUM_RE.test(v)) out.push(Number(v));
  }
  return out;
}

function buckets(records, field) {
  const pmap = new Map();
  const omap = new Map();
  for (const r of records) {
    if (!r || !has(r, field) || r[field] === null || r[field] === undefined) continue;
    const v = r[field];
    const id = typeof v === 'object' ? JSON.stringify(v) : v;
    const map = typeof v === 'object' ? omap : pmap;
    const b = map.get(id);
    if (b) b.count++;
    else map.set(id, { key: v, count: 1 });
  }
  return [...pmap.values(), ...omap.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function aggregate(records, spec) {
  const s = parseSpec(spec);
  switch (s.kind) {
    case 'count':
      return { type: 'count', value: records.length };
    case 'count_by':
      return { type: 'count_by', field: s.field, buckets: buckets(records, s.field) };
    case 'top':
      return { type: 'top', field: s.field, buckets: buckets(records, s.field).slice(0, s.n) };
    case 'num': {
      const v = numeric(records, s.field);
      let value = null;
      if (v.length) {
        const sum = v.reduce((a, b) => a + b, 0);
        if (s.type === 'sum') value = sum;
        else if (s.type === 'avg') value = Math.round((sum / v.length) * 1e4) / 1e4;
        else if (s.type === 'min') value = v.reduce((a, b) => (b < a ? b : a));
        else value = v.reduce((a, b) => (b > a ? b : a));
      }
      return { type: s.type, field: s.field, value };
    }
    case 'pct': {
      const v = numeric(records, s.field).sort((a, b) => a - b);
      let value = null;
      if (v.length) {
        const rank = Math.max(1, Math.ceil(s.p / 100 * v.length));
        value = v[rank - 1];
      }
      return { type: s.type, field: s.field, value };
    }
    default: {
      const counts = new Map();
      let lo = Infinity;
      let hi = -Infinity;
      for (const r of records) {
        if (!r || !has(r, '@t') || typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
        const m = Math.floor(r['@t'] / s.ms) * s.ms;
        counts.set(m, (counts.get(m) || 0) + 1);
        if (m < lo) lo = m;
        if (m > hi) hi = m;
      }
      const out = [];
      if (counts.size) {
        for (let m = lo; m <= hi; m += s.ms) {
          out.push({ key: new Date(m).toISOString(), count: counts.get(m) || 0 });
        }
      }
      return { type: 'histogram', interval: s.interval, buckets: out };
    }
  }
}

module.exports = { aggregate };
