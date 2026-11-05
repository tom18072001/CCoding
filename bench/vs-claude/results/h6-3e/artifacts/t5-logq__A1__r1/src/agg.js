'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
const PCT = { p50: 50, p90: 90, p95: 95, p99: 99 };

function invalid(spec, why) {
  return new Error('invalid aggregation: ' + (why ? why + ': ' : '') + JSON.stringify(spec));
}

function toNumber(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function numbers(records, field) {
  const out = [];
  for (const r of records) {
    if (!Object.prototype.hasOwnProperty.call(r, field)) continue;
    const n = toNumber(r[field]);
    if (n !== null) out.push(n);
  }
  return out;
}

function buckets(records, field) {
  const map = new Map();
  for (const r of records) {
    if (!Object.prototype.hasOwnProperty.call(r, field)) continue;
    const v = r[field];
    if (v === undefined || v === null) continue;
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

function parseSpec(spec) {
  if (typeof spec !== 'string') throw invalid(spec, 'spec must be a string');
  const parts = spec.trim().split(/\s+/);
  const [kind, a, b] = parts;
  const n = parts.length;
  if (kind === 'count' && n === 1) return { kind: 'count' };
  if (kind === 'count' && n === 3 && a === 'by') return { kind: 'count_by', field: b };
  if (kind === 'top' && n === 3) {
    if (!/^\d+$/.test(a) || !Number.isSafeInteger(Number(a)) || Number(a) < 1) throw invalid(spec, 'n must be an integer >= 1');
    return { kind: 'top', n: Number(a), field: b };
  }
  if ((kind === 'sum' || kind === 'avg' || kind === 'min' || kind === 'max') && n === 2) return { kind, field: a };
  if (PCT[kind] !== undefined && n === 2) return { kind: 'pct', type: kind, p: PCT[kind], field: a };
  if (kind === 'histogram' && n === 2) {
    const m = /^(\d+)([smhd])$/.exec(a);
    if (m && Number.isSafeInteger(Number(m[1])) && Number(m[1]) >= 1) {
      return { kind: 'histogram', interval: a, step: Number(m[1]) * UNIT_MS[m[2]] };
    }
    throw invalid(spec, 'bad interval');
  }
  throw invalid(spec);
}

function aggregate(records, spec) {
  const s = parseSpec(spec);
  records = Array.from(records);
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
      const vals = numbers(records, s.field);
      let value = null;
      if (vals.length > 0) {
        if (s.kind === 'sum') value = vals.reduce((x, y) => x + y, 0);
        else if (s.kind === 'avg') value = Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 1e4) / 1e4;
        else if (s.kind === 'min') value = vals.reduce((x, y) => (y < x ? y : x));
        else value = vals.reduce((x, y) => (y > x ? y : x));
      }
      return { type: s.kind, field: s.field, value };
    }
    case 'pct': {
      const vals = numbers(records, s.field).sort((x, y) => x - y);
      let value = null;
      if (vals.length > 0) {
        const rank = Math.max(1, Math.ceil((s.p / 100) * vals.length));
        value = vals[rank - 1];
      }
      return { type: s.type, field: s.field, value };
    }
    case 'histogram': {
      const counts = new Map();
      let lo = Infinity;
      let hi = -Infinity;
      for (const r of records) {
        const t = r['@t'];
        if (typeof t !== 'number' || !Number.isFinite(t) || !Object.prototype.hasOwnProperty.call(r, '@t')) continue;
        const slot = Math.floor(t / s.step) * s.step;
        counts.set(slot, (counts.get(slot) || 0) + 1);
        if (slot < lo) lo = slot;
        if (slot > hi) hi = slot;
      }
      const out = [];
      if (counts.size > 0) {
        for (let t = lo; t <= hi; t += s.step) {
          out.push({ key: new Date(t).toISOString(), count: counts.get(t) || 0 });
        }
      }
      return { type: 'histogram', interval: s.interval, buckets: out };
    }
    default:
      throw invalid(spec);
  }
}

module.exports = { aggregate };
