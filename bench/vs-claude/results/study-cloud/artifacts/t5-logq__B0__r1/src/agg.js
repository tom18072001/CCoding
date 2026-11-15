'use strict';

const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
const NUM_RE = /^-?\d+(\.\d+)?$/;
const INT_RE = /^\d+$/;

function invalid(spec, why) {
  return new Error('invalid aggregation: ' + why + ' (' + JSON.stringify(spec) + ')');
}

function parseSpec(spec) {
  if (typeof spec !== 'string') throw invalid(spec, 'spec must be a string');
  const t = spec.trim().split(/\s+/).filter((x) => x !== '');
  if (t.length === 0) throw invalid(spec, 'empty spec');
  const kw = t[0];
  const need = (n) => {
    if (t.length !== n) throw invalid(spec, t.length < n ? 'missing argument' : 'unexpected token');
  };
  if (kw === 'count') {
    if (t.length === 1) return { kind: 'count' };
    if (t[1] !== 'by') throw invalid(spec, 'unexpected token');
    need(3);
    return { kind: 'group', type: 'count_by', field: t[2] };
  }
  if (kw === 'top') {
    need(3);
    if (!INT_RE.test(t[1]) || Number(t[1]) < 1) throw invalid(spec, 'n must be an integer >= 1');
    return { kind: 'group', type: 'top', field: t[2], n: Number(t[1]) };
  }
  if (kw === 'sum' || kw === 'avg' || kw === 'min' || kw === 'max') {
    need(2);
    return { kind: 'stat', type: kw, field: t[1] };
  }
  if (/^p(50|90|95|99)$/.test(kw)) {
    need(2);
    return { kind: 'pct', type: kw, p: Number(kw.slice(1)), field: t[1] };
  }
  if (kw === 'histogram') {
    need(2);
    const m = /^(\d+)([smhd])$/.exec(t[1]);
    if (!m || Number(m[1]) < 1) throw invalid(spec, 'bad interval');
    return { kind: 'hist', interval: t[1], ms: Number(m[1]) * UNIT_MS[m[2]] };
  }
  throw invalid(spec, 'unknown keyword');
}

function numericValues(records, field) {
  const out = [];
  for (const r of records) {
    const v = r == null ? undefined : r[field];
    if (typeof v === 'number') {
      if (Number.isFinite(v)) out.push(v);
    } else if (typeof v === 'string' && NUM_RE.test(v)) {
      out.push(Number(v));
    }
  }
  return out;
}

function group(records, field) {
  const map = new Map();
  for (const r of records) {
    const v = r == null ? undefined : r[field];
    if (v === undefined || v === null) continue;
    const k = typeof v + ':' + String(v);
    const e = map.get(k);
    if (e) e.count++;
    else map.set(k, { key: v, count: 1 });
  }
  const arr = [...map.values()];
  arr.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return arr;
}

function aggregate(records, spec) {
  const s = parseSpec(spec);
  const recs = Array.isArray(records) ? records : [];
  switch (s.kind) {
    case 'count':
      return { type: 'count', value: recs.length };
    case 'group': {
      let buckets = group(recs, s.field);
      if (s.type === 'top') buckets = buckets.slice(0, s.n);
      return { type: s.type, field: s.field, buckets };
    }
    case 'stat': {
      const v = numericValues(recs, s.field);
      let value = null;
      if (v.length) {
        if (s.type === 'sum') value = v.reduce((a, b) => a + b, 0);
        else if (s.type === 'avg') value = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1e4) / 1e4;
        else if (s.type === 'min') value = v.reduce((a, b) => (b < a ? b : a));
        else value = v.reduce((a, b) => (b > a ? b : a));
      }
      return { type: s.type, field: s.field, value };
    }
    case 'pct': {
      const v = numericValues(recs, s.field).sort((a, b) => a - b);
      let value = null;
      if (v.length) {
        const rank = Math.max(1, Math.ceil((s.p / 100) * v.length));
        value = v[rank - 1];
      }
      return { type: s.type, field: s.field, value };
    }
    default: {
      const counts = new Map();
      let lo = Infinity;
      let hi = -Infinity;
      for (const r of recs) {
        const t = r == null ? undefined : r['@t'];
        if (typeof t !== 'number' || !Number.isFinite(t)) continue;
        const b = Math.floor(t / s.ms) * s.ms;
        counts.set(b, (counts.get(b) || 0) + 1);
        if (b < lo) lo = b;
        if (b > hi) hi = b;
      }
      const buckets = [];
      if (counts.size) {
        for (let b = lo; b <= hi; b += s.ms) {
          buckets.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
        }
      }
      return { type: 'histogram', interval: s.interval, buckets };
    }
  }
}

module.exports = { aggregate };
