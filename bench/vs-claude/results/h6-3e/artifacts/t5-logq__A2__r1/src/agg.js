'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function invalid(spec) {
  return new Error(`invalid aggregation: ${spec}`);
}

function numericValues(records, field) {
  const out = [];
  for (const r of records) {
    if (!hasOwn(r, field)) continue;
    const v = r[field];
    if (typeof v === 'number') {
      if (!Number.isNaN(v)) out.push(v);
    } else if (typeof v === 'string' && NUM_RE.test(v)) out.push(Number(v));
  }
  return out;
}

function buckets(records, field) {
  const map = new Map();
  for (const r of records) {
    if (!hasOwn(r, field)) continue;
    const v = r[field];
    if (v === null || v === undefined) continue;
    const id = typeof v + ':' + (typeof v === 'object' ? JSON.stringify(v) : String(v));
    const b = map.get(id);
    if (b) b.count++;
    else map.set(id, { key: v, count: 1 });
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
  if (typeof spec !== 'string') throw invalid(String(spec));
  const parts = spec.trim().split(/\s+/);
  const cmd = parts[0];
  const bad = () => invalid(spec.trim());

  if (cmd === 'count') {
    if (parts.length === 1) return { type: 'count', value: records.length };
    if (parts.length === 3 && parts[1] === 'by') {
      return { type: 'count_by', field: parts[2], buckets: buckets(records, parts[2]) };
    }
    throw bad();
  }
  if (cmd === 'top') {
    if (parts.length !== 3 || !/^\d+$/.test(parts[1]) || Number(parts[1]) < 1) throw bad();
    return { type: 'top', field: parts[2], buckets: buckets(records, parts[2]).slice(0, Number(parts[1])) };
  }
  if (cmd === 'sum' || cmd === 'avg' || cmd === 'min' || cmd === 'max') {
    if (parts.length !== 2) throw bad();
    const field = parts[1];
    const vals = numericValues(records, field);
    let value = null;
    if (vals.length) {
      if (cmd === 'sum') value = vals.reduce((a, b) => a + b, 0);
      else if (cmd === 'avg') value = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1e4) / 1e4;
      else if (cmd === 'min') value = vals.reduce((a, b) => (b < a ? b : a));
      else value = vals.reduce((a, b) => (b > a ? b : a));
    }
    return { type: cmd, field, value };
  }
  if (cmd === 'p50' || cmd === 'p90' || cmd === 'p95' || cmd === 'p99') {
    if (parts.length !== 2) throw bad();
    const field = parts[1];
    const vals = numericValues(records, field).sort((a, b) => a - b);
    let value = null;
    if (vals.length) {
      const p = Number(cmd.slice(1));
      const rank = Math.max(1, Math.ceil((p / 100) * vals.length));
      value = vals[rank - 1];
    }
    return { type: cmd, field, value };
  }
  if (cmd === 'histogram') {
    const m = parts.length === 2 ? /^(\d+)([smhd])$/.exec(parts[1]) : null;
    if (!m || Number(m[1]) < 1) throw bad();
    const k = Number(m[1]);
    const step = k * UNITS[m[2]];
    const counts = new Map();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of records) {
      const t = hasOwn(r, '@t') ? r['@t'] : undefined;
      if (typeof t !== 'number' || !Number.isFinite(t)) continue;
      const b = Math.floor(t / step) * step;
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
  throw bad();
}

module.exports = { aggregate };
