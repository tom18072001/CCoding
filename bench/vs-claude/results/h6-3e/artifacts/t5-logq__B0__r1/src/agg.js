'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function invalid(spec) {
  return new Error('invalid aggregation: ' + String(spec).trim());
}

function toNum(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return null;
}

function has(r, f) {
  return Object.prototype.hasOwnProperty.call(r, f) && r[f] !== null && r[f] !== undefined;
}

function nums(records, f) {
  const out = [];
  for (const r of records) {
    if (!Object.prototype.hasOwnProperty.call(r, f)) continue;
    const n = toNum(r[f]);
    if (n !== null) out.push(n);
  }
  return out;
}

function buckets(records, f) {
  const map = new Map();
  for (const r of records) {
    if (!has(r, f)) continue;
    const key = r[f];
    const id = typeof key + ':' + String(key);
    const b = map.get(id);
    if (b) b.count++;
    else map.set(id, { key, count: 1 });
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const x = String(a.key);
    const y = String(b.key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function aggregate(records, spec) {
  if (typeof spec !== 'string') throw invalid(spec);
  const parts = spec.trim().split(/\s+/);
  const cmd = parts[0];
  const argc = parts.length;

  if (cmd === 'count' && argc === 1) return { type: 'count', value: records.length };
  if (cmd === 'count' && argc === 3 && parts[1] === 'by') {
    return { type: 'count_by', field: parts[2], buckets: buckets(records, parts[2]) };
  }
  if (cmd === 'top' && argc === 3 && /^\d+$/.test(parts[1]) && Number(parts[1]) >= 1) {
    return { type: 'top', field: parts[2], buckets: buckets(records, parts[2]).slice(0, Number(parts[1])) };
  }
  if (['sum', 'avg', 'min', 'max'].includes(cmd) && argc === 2) {
    const f = parts[1];
    const v = nums(records, f);
    let value = null;
    if (v.length) {
      if (cmd === 'sum') value = v.reduce((a, b) => a + b, 0);
      else if (cmd === 'avg') value = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1e4) / 1e4;
      else if (cmd === 'min') value = v.reduce((a, b) => (b < a ? b : a));
      else value = v.reduce((a, b) => (b > a ? b : a));
    }
    return { type: cmd, field: f, value };
  }
  if (/^p(50|90|95|99)$/.test(cmd) && argc === 2) {
    const f = parts[1];
    const v = nums(records, f).sort((a, b) => a - b);
    let value = null;
    if (v.length) {
      const rank = Math.max(1, Math.ceil(Number(cmd.slice(1)) / 100 * v.length));
      value = v[rank - 1];
    }
    return { type: cmd, field: f, value };
  }
  if (cmd === 'histogram' && argc === 2) {
    const m = /^(\d+)([smhd])$/.exec(parts[1]);
    if (!m || Number(m[1]) < 1) throw invalid(spec);
    const k = Number(m[1]);
    const step = k * UNIT_MS[m[2]];
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
    const out = [];
    if (counts.size) {
      for (let b = lo; b <= hi; b += step) {
        out.push({ key: new Date(b).toISOString(), count: counts.get(b) || 0 });
      }
    }
    return { type: 'histogram', interval: k + m[2], buckets: out };
  }
  throw invalid(spec);
}

module.exports = { aggregate };
