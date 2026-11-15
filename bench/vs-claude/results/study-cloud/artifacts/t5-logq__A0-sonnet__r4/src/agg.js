'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function invalid(spec) {
  return new Error('invalid aggregation: ' + String(spec).trim());
}

function numbers(records, f) {
  const out = [];
  for (const r of records) {
    if (!has(r, f)) continue;
    const v = r[f];
    if (typeof v === 'number') { if (!Number.isNaN(v)) out.push(v); }
    else if (typeof v === 'string' && NUM_RE.test(v)) out.push(Number(v));
  }
  return out;
}

function buckets(records, f) {
  const m = new Map();
  for (const r of records) {
    if (!has(r, f)) continue;
    const v = r[f];
    if (v === null || v === undefined) continue;
    const id = typeof v === 'object' ? 'o:' + JSON.stringify(v) : v;
    const b = m.get(id);
    if (b) b.count++;
    else m.set(id, { key: v, count: 1 });
  }
  return [...m.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key), y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw invalid(spec);
  const parts = spec.trim().split(/\s+/);
  const cmd = parts[0];
  const argc = parts.length;
  if (cmd === 'count') {
    if (argc === 1) return { type: 'count', value: records.length };
    if (argc === 3 && parts[1] === 'by') return { type: 'count_by', field: parts[2], buckets: buckets(records, parts[2]) };
    throw invalid(spec);
  }
  if (cmd === 'top') {
    if (argc === 3 && /^\d+$/.test(parts[1]) && Number(parts[1]) >= 1) {
      return { type: 'top', field: parts[2], buckets: buckets(records, parts[2]).slice(0, Number(parts[1])) };
    }
    throw invalid(spec);
  }
  if (['sum', 'avg', 'min', 'max'].includes(cmd)) {
    if (argc !== 2) throw invalid(spec);
    const f = parts[1];
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
  if (/^p(50|90|95|99)$/.test(cmd)) {
    if (argc !== 2) throw invalid(spec);
    const f = parts[1];
    const xs = numbers(records, f).sort((a, b) => a - b);
    let value = null;
    if (xs.length) {
      const rank = Math.max(1, Math.ceil((Number(cmd.slice(1)) / 100) * xs.length));
      value = xs[rank - 1];
    }
    return { type: cmd, field: f, value };
  }
  if (cmd === 'histogram') {
    const m = argc === 2 ? /^(\d+)([smhd])$/.exec(parts[1]) : null;
    if (!m || Number(m[1]) < 1) throw invalid(spec);
    const k = Number(m[1]);
    const size = k * UNITS[m[2]];
    const counts = new Map();
    let lo = Infinity, hi = -Infinity;
    for (const r of records) {
      if (!has(r, '@t') || typeof r['@t'] !== 'number' || !Number.isFinite(r['@t'])) continue;
      const b = Math.floor(r['@t'] / size) * size;
      counts.set(b, (counts.get(b) || 0) + 1);
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    const out = [];
    if (counts.size) {
      for (let b = lo; b <= hi; b += size) out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
    }
    return { type: 'histogram', interval: k + m[2], buckets: out };
  }
  throw invalid(spec);
}

module.exports = { aggregate };
