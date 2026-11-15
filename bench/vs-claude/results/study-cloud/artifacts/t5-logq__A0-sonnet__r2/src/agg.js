'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec) {
  return new Error(`invalid aggregation: ${typeof spec === 'string' ? spec : String(spec)}`);
}

function parseSpec(spec) {
  if (typeof spec !== 'string') throw invalid(spec);
  const t = spec.trim().split(/\s+/);
  const cmd = t[0];
  if (cmd === 'count') {
    if (t.length === 1) return { kind: 'count' };
    if (t.length === 3 && t[1] === 'by') return { kind: 'count_by', field: t[2] };
    throw invalid(spec);
  }
  if (cmd === 'top') {
    if (t.length === 3 && /^\d+$/.test(t[1]) && Number(t[1]) >= 1) {
      return { kind: 'top', n: Number(t[1]), field: t[2] };
    }
    throw invalid(spec);
  }
  if (['sum', 'avg', 'min', 'max'].includes(cmd)) {
    if (t.length === 2) return { kind: cmd, field: t[1] };
    throw invalid(spec);
  }
  if (/^p(50|90|95|99)$/.test(cmd)) {
    if (t.length === 2) return { kind: cmd, p: Number(cmd.slice(1)), field: t[1] };
    throw invalid(spec);
  }
  if (cmd === 'histogram') {
    const m = t.length === 2 && /^(\d+)([smhd])$/.exec(t[1]);
    if (m && Number(m[1]) >= 1) {
      return { kind: 'histogram', interval: t[1], ms: Number(m[1]) * UNITS[m[2]] };
    }
    throw invalid(spec);
  }
  throw invalid(spec);
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function numericValues(records, field) {
  const out = [];
  for (const r of records) {
    if (!has(r, field)) continue;
    const v = r[field];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    else if (typeof v === 'string' && NUM_RE.test(v)) out.push(Number(v));
  }
  return out;
}

function buckets(records, field) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, field) || r[field] == null) continue;
    const v = r[field];
    const id = typeof v === 'object' ? 'o:' + JSON.stringify(v) : typeof v + ':' + String(v);
    const b = map.get(id);
    if (b) b.count++;
    else map.set(id, { key: v, count: 1 });
  }
  return [...map.values()].sort((a, b) => {
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
    case 'sum':
    case 'avg':
    case 'min':
    case 'max': {
      const v = numericValues(records, s.field);
      let value = null;
      if (v.length) {
        if (s.kind === 'sum') value = v.reduce((a, b) => a + b, 0);
        else if (s.kind === 'avg') value = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1e4) / 1e4;
        else if (s.kind === 'min') value = v.reduce((a, b) => (b < a ? b : a));
        else value = v.reduce((a, b) => (b > a ? b : a));
      }
      return { type: s.kind, field: s.field, value };
    }
    case 'histogram': {
      const counts = new Map();
      let lo = Infinity;
      let hi = -Infinity;
      for (const r of records) {
        if (!has(r, '@t') || typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
        const b = Math.floor(r['@t'] / s.ms) * s.ms;
        counts.set(b, (counts.get(b) || 0) + 1);
        if (b < lo) lo = b;
        if (b > hi) hi = b;
      }
      const out = [];
      if (counts.size) {
        for (let b = lo; b <= hi; b += s.ms) {
          out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
        }
      }
      return { type: 'histogram', interval: s.interval, buckets: out };
    }
    default: {
      const v = numericValues(records, s.field).sort((a, b) => a - b);
      let value = null;
      if (v.length) value = v[Math.ceil((s.p / 100) * v.length) - 1];
      return { type: s.kind, field: s.field, value };
    }
  }
}

module.exports = { aggregate };
